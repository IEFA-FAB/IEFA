import { createFileRoute, useRouter } from "@tanstack/react-router"
import { RefreshCw, Save, SlidersHorizontal, TriangleAlert } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { UnsavedChangesGuard } from "@/components/features/shared/UnsavedChangesGuard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { isDraftValueEqual } from "@/lib/drafts/draft-diff"
import { rebaseDraftValues } from "@/lib/drafts/rebase-draft"
import {
	isStockSettingsConflict,
	MAX_LEAD_TIME_DAYS,
	parseLeadTimeInput,
	type StockSettings,
	type StockSettingsValues,
	stockSettingsValues,
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
 * Edição sem perda (EDIT-SAFETY.md): a gravação leva a versão que a tela abriu e o servidor
 * recusa se outra pessoa salvou no meio-tempo. A versão é relida no foco da janela; divergiu,
 * a tela congela e oferece abrir a atual levando as alterações (merge de três vias). Sair com
 * alteração pendente pede confirmação.
 */

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/settings")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 3),
	loader: ({ params }) => fetchStockSettingsFn({ data: { kitchenId: Number(params.kitchenId) } }),
	component: StockSettingsPage,
})

const LABELS: Record<keyof StockSettingsValues, string> = {
	segregation: "Segregação de funções",
	adjustmentApprovalValue: "Alçada de ajuste",
	issueTolerancePct: "Tolerância da saída",
	issueToleranceFloorValue: "Piso da tolerância da saída",
	countTolerancePct: "Tolerância da contagem",
	countToleranceValue: "Piso da tolerância da contagem",
	defaultLeadTimeDays: "Prazo de entrega padrão",
}

function StockSettingsPage() {
	const settings = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	const router = useRouter()
	// `opened` é a versão sobre a qual a edição começou: base do merge e da guarda de saída.
	const [opened, setOpened] = useState<StockSettings>(settings)
	const [form, setForm] = useState<StockSettingsValues>(() => stockSettingsValues(settings))
	const [leadTimeText, setLeadTimeText] = useState(settings.defaultLeadTimeDays?.toString() ?? "")
	// Versão atual mais nova que a aberta: a edição congela até o usuário levá-la para a atual.
	const [head, setHead] = useState<StockSettings | null>(null)
	const [busy, setBusy] = useState(false)

	const leadTime = parseLeadTimeInput(leadTimeText)
	const values: StockSettingsValues = { ...form, defaultLeadTimeDays: leadTime.value }
	const isDirty = leadTime.invalid || !isDraftValueEqual(values, stockSettingsValues(opened))
	const dirtyRef = useRef(isDirty)
	dirtyRef.current = isDirty

	function applyBaseline(next: StockSettings, nextValues: StockSettingsValues = stockSettingsValues(next)) {
		setOpened(next)
		setForm(nextValues)
		setLeadTimeText(nextValues.defaultLeadTimeDays?.toString() ?? "")
		setHead(null)
	}

	async function checkHead() {
		const current = await fetchStockSettingsFn({ data: { kitchenId: Number(kitchenId) } })
		if (current.version === opened.version) return
		// Sem alteração pendente não há o que levar: a tela só passa a mostrar a atual.
		if (!isDirty) applyBaseline(current)
		else setHead(current)
	}
	// O ouvinte do foco chama sempre a versão desta renderização (versão aberta e pendência atuais).
	const checkHeadRef = useRef(checkHead)
	checkHeadRef.current = checkHead

	useEffect(() => {
		const onFocus = () => {
			checkHeadRef.current().catch(() => {
				// Falha da releitura não é conflito: a gravação ainda confere a versão no servidor.
			})
		}
		window.addEventListener("focus", onFocus)
		return () => window.removeEventListener("focus", onFocus)
	}, [])

	function carryToHead() {
		if (!head) return
		const { values: merged, carried, overlapping } = rebaseDraftValues(stockSettingsValues(opened), values, stockSettingsValues(head))
		applyBaseline(head, merged)
		if (overlapping.length > 0) {
			toast.warning(
				`Confira: ${overlapping.map((field) => LABELS[field as keyof StockSettingsValues] ?? field).join(", ")} também foi alterado por outra pessoa.`
			)
		} else if (carried.length > 0) {
			toast.success("Suas alterações foram levadas para a versão atual. Confira e salve.")
		}
	}

	async function save() {
		if (leadTime.invalid) return
		setBusy(true)
		try {
			const { version } = await saveStockSettingsFn({ data: { kitchenId: Number(kitchenId), expectedVersion: opened.version, ...values } })
			applyBaseline({ ...values, version }, values)
			toast.success("Configurações salvas")
			await router.invalidate()
		} catch (error) {
			const message = error instanceof Error ? error.message : "Erro ao salvar"
			if (isStockSettingsConflict(message)) {
				const current = await fetchStockSettingsFn({ data: { kitchenId: Number(kitchenId) } }).catch(() => null)
				if (current) setHead(current)
			}
			toast.error(message)
		} finally {
			setBusy(false)
		}
	}

	const frozen = head != null

	return (
		<div className="space-y-4">
			<UnsavedChangesGuard isDirty={() => dirtyRef.current} />
			<PageHeader
				title="Configurações de estoque"
				description="Tolerâncias, alçada de ajuste, regime de segregação de funções e prazo de entrega padrão desta cozinha."
			/>

			{frozen && (
				<Alert variant="warning">
					<TriangleAlert />
					<AlertTitle>Outra pessoa salvou estas configurações</AlertTitle>
					<AlertDescription>
						<p>A edição está pausada para não gravar por cima. Suas alterações estão guardadas: abra a versão atual levando-as e confira antes de salvar.</p>
						<Button type="button" variant="outline" size="sm" className="mt-2" onClick={carryToHead}>
							<RefreshCw className="mr-2 size-4" />
							Abrir a versão atual com minhas alterações
						</Button>
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
					<fieldset disabled={frozen} className="grid gap-4 md:grid-cols-2">
						<div className="space-y-1 md:col-span-2">
							<Label htmlFor="segregation">Segregação de funções</Label>
							<Select
								value={form.segregation}
								disabled={frozen}
								onValueChange={(value) => setForm((c) => ({ ...c, segregation: (value ?? "dual") as typeof c.segregation }))}
							>
								<SelectTrigger id="segregation">
									<SelectValue>
										{form.segregation === "strict" ? "Estrita — aprovador diferente de quem lançou e de quem contou" : "Dupla — duas pessoas quaisquer"}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="dual">Dupla — duas pessoas quaisquer</SelectItem>
									<SelectItem value="strict">Estrita — aprovador diferente de quem lançou e de quem contou</SelectItem>
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
							<Input
								id="leadTime"
								type="number"
								inputMode="numeric"
								min={1}
								max={MAX_LEAD_TIME_DAYS}
								step={1}
								placeholder="Não configurado"
								aria-invalid={leadTime.invalid || undefined}
								aria-describedby="leadTimeHint"
								value={leadTimeText}
								onChange={(event) => setLeadTimeText(event.target.value)}
							/>
							<p id="leadTimeHint" className={leadTime.invalid ? "text-hint text-destructive" : "text-hint text-muted-foreground"}>
								{leadTime.invalid
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

						<div className="md:col-span-2">
							<Button type="button" onClick={save} disabled={busy || frozen || leadTime.invalid || !isDirty}>
								<Save className="mr-2 size-4" />
								Salvar
							</Button>
						</div>
					</fieldset>
				</CardContent>
			</Card>
		</div>
	)
}
