import { createFileRoute, useRouter } from "@tanstack/react-router"
import { RefreshCw, Save, SlidersHorizontal, TriangleAlert } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PendingChanges } from "@/components/features/shared/PendingChanges"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { useDraft } from "@/hooks/forms/useDraft"
import type { DraftFields } from "@/lib/drafts/draft-diff"
import { rebaseDraftValues } from "@/lib/drafts/rebase-draft"
import {
	isStockSettingsConflict,
	MAX_LEAD_TIME_DAYS,
	parseLeadTimeInput,
	type StockSettings,
	type StockSettingsDraft,
	stockSettingsDraftKey,
	stockSettingsFromDraft,
	toStockSettingsDraft,
} from "@/lib/kitchen-stock-settings"
import { fetchStockSettingsFn, saveStockSettingsFn } from "@/server/adjustment.fn"

/**
 * Configuração de estoque da cozinha.
 *
 * Os números aqui são os que decidem quando o sistema PEDE alguma coisa do
 * operador: motivo na saída, aprovação no ajuste, recontagem no inventário. Os
 * defaults são chute calibrável — cozinha com movimento grande e cozinha de
 * destacamento não têm a mesma noção de "diferença relevante", e um teto
 * apertado demais é o que faz todo mundo marcar "outro" e seguir.
 *
 * O prazo de entrega padrão é a exceção: não tem default. Vazio, a reposição mostra
 * "prazo de entrega não configurado" nos insumos sem histórico do fornecedor, em vez de
 * presumir um número.
 *
 * Edição sem perda (EDIT-SAFETY.md, modo A de docs/SAVE_BEHAVIOR.md):
 * - rascunho local por conta (`useDraft`, chave por cozinha) enquanto a edição difere do salvo,
 *   com as alterações pendentes ao lado do Salvar;
 * - a gravação leva a versão aberta e o servidor recusa se outra pessoa salvou no meio-tempo;
 * - a versão é relida no foco da janela; divergiu com edição pendente, a tela congela e oferece
 *   abrir a atual levando as alterações (merge de três vias). Sem edição pendente, só atualiza.
 */

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/settings")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 3),
	loader: ({ params }) => fetchStockSettingsFn({ data: { kitchenId: Number(params.kitchenId) } }),
	component: StockSettingsPage,
})

const SEGREGATION_LABEL: Record<StockSettingsDraft["segregation"], string> = {
	dual: "Dupla — duas pessoas quaisquer",
	strict: "Estrita — aprovador diferente de quem lançou e de quem contou",
}

const DRAFT_FIELDS: DraftFields<StockSettingsDraft> = {
	segregation: { label: "Segregação de funções", format: (value) => SEGREGATION_LABEL[value] },
	adjustmentApprovalValue: { label: "Alçada de ajuste (R$)" },
	defaultLeadTimeText: { label: "Prazo de entrega padrão", format: (value) => (value.trim() === "" ? "Não configurado" : `${value.trim()} dias`) },
	issueTolerancePct: { label: "Tolerância da saída (%)" },
	issueToleranceFloorValue: { label: "Piso da tolerância da saída (R$)" },
	countTolerancePct: { label: "Tolerância da contagem (%)" },
	countToleranceValue: { label: "Piso da tolerância da contagem (R$)" },
}

function StockSettingsPage() {
	const settings = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	// O roteador mantém o componente montado ao trocar de cozinha: a `key` remonta o editor, e
	// estado, rascunho e versão nunca passam de uma cozinha para outra.
	return <StockSettingsEditor key={kitchenId} kitchenId={Number(kitchenId)} settings={settings} />
}

/** `head: null` = o servidor recusou por versão e a releitura da atual ainda não voltou. */
type Conflict = { head: StockSettings | null }

function StockSettingsEditor({ kitchenId, settings }: { kitchenId: number; settings: StockSettings }) {
	const router = useRouter()
	// `opened` é a versão sobre a qual a edição começou: base do merge, do rascunho e da gravação.
	const [opened, setOpened] = useState<StockSettings>(settings)
	const [form, setForm] = useState<StockSettingsDraft>(() => toStockSettingsDraft(settings))
	const [conflict, setConflict] = useState<Conflict | null>(null)
	const [busy, setBusy] = useState(false)

	const baseline = toStockSettingsDraft(opened)
	const toSave = stockSettingsFromDraft(form)
	const leadTimeInvalid = parseLeadTimeInput(form.defaultLeadTimeText).invalid
	const draft = useDraft<StockSettingsDraft>({
		key: stockSettingsDraftKey(kitchenId),
		title: "Configurações de estoque",
		href: `/storage/${kitchenId}/settings`,
		baseline,
		current: form,
		baseStamp: opened.version ?? "sem-linha",
		fields: DRAFT_FIELDS,
		onRestore: setForm,
	})

	// O que a releitura do foco consulta DEPOIS do await: a renderização em que o foco disparou
	// já pode ter passado (o usuário digitou, ou salvou, enquanto a leitura voava).
	const live = useRef({ isDirty: draft.isDirty, openedVersion: opened.version, hasConflict: conflict != null })
	live.current = { isDirty: draft.isDirty, openedVersion: opened.version, hasConflict: conflict != null }
	const savingRef = useRef(false)
	// Cada gravação abre uma época nova; leitura iniciada antes dela é descartada (veria a versão
	// de antes do próprio save e acusaria "outra pessoa salvou").
	const saveEpoch = useRef(0)

	function applyBaseline(next: StockSettings, nextForm: StockSettingsDraft = toStockSettingsDraft(next)) {
		setOpened(next)
		setForm(nextForm)
		setConflict(null)
	}

	async function checkHead() {
		if (savingRef.current) return
		const epoch = saveEpoch.current
		const current = await fetchStockSettingsFn({ data: { kitchenId } })
		const now = live.current
		if (savingRef.current || epoch !== saveEpoch.current) return
		if (current.version === now.openedVersion) return
		// Edição pendente (ou conflito já aberto) nunca é sobrescrita: congela e oferece levar.
		if (now.isDirty || now.hasConflict) setConflict({ head: current })
		else applyBaseline(current)
	}
	const checkHeadRef = useRef(checkHead)
	checkHeadRef.current = checkHead

	useEffect(() => {
		const onFocus = () => {
			checkHeadRef.current().catch(() => {
				// Falha da releitura não é conflito: a gravação ainda confere a versão no servidor, e
				// um conflito já aberto continua congelado até a próxima leitura dar certo.
			})
		}
		window.addEventListener("focus", onFocus)
		return () => window.removeEventListener("focus", onFocus)
	}, [])

	async function retryReadHead() {
		try {
			const current = await fetchStockSettingsFn({ data: { kitchenId } })
			setConflict({ head: current })
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Não foi possível ler a versão atual")
		}
	}

	function carryToHead() {
		const head = conflict?.head
		if (!head) return
		// Merge sobre o rascunho, com o prazo como TEXTO: o que o usuário digitou (mesmo inválido)
		// vai como está, e o que só a outra pessoa mudou vem da atual.
		const { values: merged, carried, overlapping } = rebaseDraftValues(baseline, form, toStockSettingsDraft(head))
		// O rascunho renasce com a assinatura da versão atual; com a antiga, ficaria "desatualizado".
		draft.clear()
		applyBaseline(head, merged)
		if (overlapping.length > 0) {
			const labels = overlapping.map((field) => DRAFT_FIELDS[field as keyof StockSettingsDraft]?.label ?? field)
			toast.warning(`Confira: ${labels.join(", ")} também foi alterado por outra pessoa. Vale o seu valor.`)
		} else if (carried.length > 0) {
			toast.success("Suas alterações foram levadas para a versão atual. Confira e salve.")
		}
	}

	async function save() {
		if (!toSave) return
		savingRef.current = true
		saveEpoch.current += 1
		setBusy(true)
		try {
			const { version } = await saveStockSettingsFn({ data: { kitchenId, expectedVersion: opened.version, ...toSave } })
			// O baseline passa a ser o gravado (texto normalizado: "05" vira "5"); com o form igual a
			// ele, o rascunho se apaga sozinho.
			applyBaseline({ ...toSave, version })
			toast.success("Configurações salvas")
			await router.invalidate()
		} catch (error) {
			const message = error instanceof Error ? error.message : "Erro ao salvar"
			toast.error(message)
			if (isStockSettingsConflict(message)) {
				// Congela já, mesmo sem a versão atual em mãos: Salvar de novo só repetiria a recusa.
				setConflict({ head: null })
				const current = await fetchStockSettingsFn({ data: { kitchenId } }).catch(() => null)
				if (current) setConflict({ head: current })
			}
		} finally {
			savingRef.current = false
			setBusy(false)
		}
	}

	const frozen = conflict != null

	return (
		<div className="space-y-4">
			<PageHeader
				title="Configurações de estoque"
				description="Tolerâncias, alçada de ajuste, regime de segregação de funções e prazo de entrega padrão desta cozinha."
			/>

			{frozen && (
				<Alert variant="warning">
					<TriangleAlert />
					<AlertTitle>Outra pessoa salvou estas configurações</AlertTitle>
					<AlertDescription>
						{conflict.head ? (
							<p>A edição está pausada para não gravar por cima. Suas alterações estão guardadas: abra a versão atual levando-as e confira antes de salvar.</p>
						) : (
							<p>A edição está pausada para não gravar por cima, e a versão atual ainda não pôde ser lida. Suas alterações estão guardadas neste navegador.</p>
						)}
						{conflict.head ? (
							<Button type="button" variant="outline" size="sm" className="mt-2" onClick={carryToHead}>
								<RefreshCw className="mr-2 size-4" />
								Abrir a versão atual com minhas alterações
							</Button>
						) : (
							<Button type="button" variant="outline" size="sm" className="mt-2" onClick={retryReadHead}>
								<RefreshCw className="mr-2 size-4" />
								Ler a versão atual de novo
							</Button>
						)}
					</AlertDescription>
				</Alert>
			)}

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<SlidersHorizontal className="size-4" />
						Parâmetros
					</CardTitle>
				</CardHeader>
				<CardContent>
					<fieldset disabled={frozen || busy} className="grid gap-4 md:grid-cols-2">
						<div className="space-y-1 md:col-span-2">
							<Label htmlFor="segregation">Segregação de funções</Label>
							<Select
								value={form.segregation}
								disabled={frozen || busy}
								onValueChange={(value) => setForm((c) => ({ ...c, segregation: (value ?? "dual") as typeof c.segregation }))}
							>
								<SelectTrigger id="segregation">
									<SelectValue>{SEGREGATION_LABEL[form.segregation]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="dual">{SEGREGATION_LABEL.dual}</SelectItem>
									<SelectItem value="strict">{SEGREGATION_LABEL.strict}</SelectItem>
								</SelectContent>
							</Select>
							<p className="text-hint text-muted-foreground">
								Quando não há segunda pessoa com nível 3 na cozinha, a operação segue e a exceção fica registrada no documento e no relatório — travar a cozinha
								no fim de semana não é controle.
							</p>
						</div>

						<div className="space-y-1">
							<Label htmlFor="approval">Alçada de ajuste (R$)</Label>
							<Input
								id="approval"
								type="number"
								min={0}
								step="0.01"
								value={form.adjustmentApprovalValue}
								onChange={(event) => setForm((c) => ({ ...c, adjustmentApprovalValue: Number(event.target.value) }))}
							/>
							<p className="text-hint text-muted-foreground">
								Acima disso o ajuste espera aprovação. A conta soma os ajustes do mesmo autor nas últimas 24 h, então fatiar o documento não escapa.
							</p>
						</div>

						<div className="space-y-1">
							<Label htmlFor="leadTime">Prazo de entrega padrão (dias)</Label>
							{/* Texto, não `type="number"`: o navegador entrega "" para "1e" ou "-", e isso viraria
							    "não configurado" calado. Aqui o texto chega como foi digitado e é validado. */}
							<Input
								id="leadTime"
								type="text"
								inputMode="numeric"
								autoComplete="off"
								placeholder="Não configurado"
								aria-invalid={leadTimeInvalid || undefined}
								aria-describedby="leadTimeHint"
								value={form.defaultLeadTimeText}
								onChange={(event) => {
									const text = event.target.value
									setForm((c) => ({ ...c, defaultLeadTimeText: text }))
								}}
							/>
							<p id="leadTimeHint" className={leadTimeInvalid ? "text-hint text-destructive" : "text-hint text-muted-foreground"}>
								{leadTimeInvalid
									? `Informe dias inteiros, de 1 a ${MAX_LEAD_TIME_DAYS}, ou deixe vazio.`
									: "Da emissão da OF à entrega. A reposição usa o histórico do fornecedor quando há; sem ele, este prazo. Vazio, a sugestão mostra a pendência e a urgência fica indeterminada."}
							</p>
						</div>

						<div className="space-y-1">
							<Label htmlFor="issuePct">Tolerância da saída (%)</Label>
							<Input
								id="issuePct"
								type="number"
								min={0}
								max={100}
								value={form.issueTolerancePct}
								onChange={(event) => setForm((c) => ({ ...c, issueTolerancePct: Number(event.target.value) }))}
							/>
						</div>

						<div className="space-y-1">
							<Label htmlFor="issueFloor">Piso da tolerância da saída (R$)</Label>
							<Input
								id="issueFloor"
								type="number"
								min={0}
								step="0.01"
								value={form.issueToleranceFloorValue}
								onChange={(event) => setForm((c) => ({ ...c, issueToleranceFloorValue: Number(event.target.value) }))}
							/>
							<p className="text-hint text-muted-foreground">
								Desvio precisa passar do percentual E do piso para pedir motivo. Sem piso, 200 g de sal fora do previsto viram "variância".
							</p>
						</div>

						<div className="space-y-1">
							<Label htmlFor="countPct">Tolerância da contagem (%)</Label>
							<Input
								id="countPct"
								type="number"
								min={0}
								max={100}
								value={form.countTolerancePct}
								onChange={(event) => setForm((c) => ({ ...c, countTolerancePct: Number(event.target.value) }))}
							/>
						</div>

						<div className="space-y-1">
							<Label htmlFor="countValue">Piso da tolerância da contagem (R$)</Label>
							<Input
								id="countValue"
								type="number"
								min={0}
								step="0.01"
								value={form.countToleranceValue}
								onChange={(event) => setForm((c) => ({ ...c, countToleranceValue: Number(event.target.value) }))}
							/>
							<p className="text-hint text-muted-foreground">Diferença acima das duas manda a linha para recontagem.</p>
						</div>

						<div className="flex flex-wrap items-center gap-2 md:col-span-2">
							<Button type="button" onClick={save} disabled={busy || frozen || toSave == null || !draft.isDirty}>
								<Save className="mr-2 size-4" />
								Salvar
							</Button>
							<PendingChanges
								draft={draft}
								disabled={busy || frozen}
								onDiscard={() => {
									draft.clear()
									setForm(baseline)
								}}
							/>
						</div>
					</fieldset>
				</CardContent>
			</Card>
		</div>
	)
}
