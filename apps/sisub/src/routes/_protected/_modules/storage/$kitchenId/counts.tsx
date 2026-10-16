import type { InventoryCountType } from "@iefa/sisub-domain"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { requirePermission } from "@/auth/pbac"
import {
	CountActions,
	CountSheetHeader,
	CountSheetTable,
	CountsHistoryCard,
	NotCountedPanel,
	OpenCountCard,
	ScannedTargetPanel,
} from "@/components/features/storage/counts/CountsSections"
import {
	buildScopeParams,
	claimEntryKey,
	deriveCountState,
	type EntryIntentKeys,
	releaseEntryKey,
	type ScannedTarget,
} from "@/components/features/storage/counts/counts-page"
import { ScanInput, scannerPropsFrom } from "@/components/features/storage/scan/ScanInput"
import { PageHeader } from "@/components/layout/PageHeader"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/components/ui/toast"
import { formatPendingProductionDays } from "@/lib/count-waiver"
import {
	acceptNotCountedFn,
	addFoundItemFn,
	approveInventoryCountFn,
	fetchCountSheetFn,
	listInventoryCountsFn,
	openInventoryCountFn,
	openRecountFn,
	postCountEntriesFn,
	rejectInventoryCountFn,
	reviewInventoryCountFn,
} from "@/server/count.fn"
import { fetchScannerProfileFn, resolveScanToIngredientFn } from "@/server/scanner.fn"

/**
 * Inventário.
 *
 * O requisito era "uma ferramenta para ajudar a refazer o inventário", e a
 * diferença entre ferramenta e planilha está em três coisas que esta tela
 * respeita e uma folha impressa não consegue:
 *
 *  • a cozinha **continua trabalhando** enquanto se conta. A diferença é
 *    medida contra o saldo no instante do lançamento, não contra o de agora;
 *  • a contagem é **cega** por padrão — quem conta não vê o esperado, porque
 *    contar sabendo o número é conferir, não contar;
 *  • **quem contou não aprova**, e isso é decidido no banco.
 *
 * A folha mostra item, lote, validade e local, e o campo "contado". O saldo só
 * aparece para o nível 3 ou depois de encerrada a coleta — e não é o React que
 * esconde: o servidor não manda o número.
 */

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/counts")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 2),
	loaderDeps: ({ search }) => ({ countId: (search as { countId?: string }).countId }),
	loader: async ({ params, deps }) => {
		const kitchenId = Number(params.kitchenId)
		const [list, scannerProfile] = await Promise.all([listInventoryCountsFn({ data: { kitchenId } }), fetchScannerProfileFn({ data: { kitchenId } })])
		// a folha aberta é a que está sendo contada; sem ela, a última em revisão
		const target =
			deps.countId ??
			// `recount` é a rodada SUBSTITUÍDA pela recontagem: não se conta mais nela
			list.counts.find((count: { status: string }) => count.status === "counting")?.id ??
			list.counts.find((count: { status: string }) => count.status === "review")?.id
		const sheet = target ? await fetchCountSheetFn({ data: { countId: target } }) : null
		return { list, sheet, scannerProfile, kitchenId }
	},
	component: CountsPage,
})

function CountsPage() {
	const { list, sheet, scannerProfile, kitchenId } = Route.useLoaderData()
	const router = useRouter()
	const [busy, setBusy] = useState(false)
	const [type, setType] = useState<InventoryCountType>("rotativo")
	const [scope, setScope] = useState("full")
	const [scopeValue, setScopeValue] = useState("")
	const [quantities, setQuantities] = useState<Record<string, string>>({})
	// O que a última leitura apontou. A folha só lista lote que já foi contado, e
	// o lote na mão do operador pode ainda não ter linha: a leitura abre o alvo
	// aqui, com o campo de quantidade, em vez de procurar uma linha que não existe.
	const [scanned, setScanned] = useState<ScannedTarget | null>(null)
	const [scannedQty, setScannedQty] = useState("")

	// Chave de idempotência por linha, viva enquanto o lançamento não for confirmado.
	const entryKeys = useRef<EntryIntentKeys>(new Map())

	/** Roda a ação com aviso; devolve se a AÇÃO deu certo (a releitura da tela não conta). */
	async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
		setBusy(true)
		let succeeded = false
		try {
			await action()
			succeeded = true
			toast.success(success)
			await router.invalidate()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro na contagem")
		} finally {
			setBusy(false)
		}
		return succeeded
	}

	/**
	 * Lança a quantidade de uma linha.
	 *
	 * O identificador é um por intenção (linha + valor), não por tentativa: dois
	 * cliques iguais seguidos, ou o reenvio depois de uma falha de rede, levam a
	 * mesma chave, e o índice único no banco ignora o segundo. A chave só se
	 * renova depois do sucesso. É a mesma proteção que a fila offline vai usar
	 * quando existir. Na falha, o valor digitado fica no campo para reenviar.
	 */
	async function postLine(
		line: { key: string; lotId: string | null; ingredientId: string | null; frozenPreparationId: string | null },
		quantity: number
	): Promise<boolean> {
		if (!sheet) return false
		const clientEventId = claimEntryKey(entryKeys.current, line.key, quantity)
		const posted = await run(
			() =>
				postCountEntriesFn({
					data: {
						countId: sheet.count.id,
						entries: [
							{
								clientEventId,
								lotId: line.lotId ?? undefined,
								ingredientId: line.lotId ? undefined : (line.ingredientId ?? undefined),
								frozenPreparationId: line.lotId ? undefined : (line.frozenPreparationId ?? undefined),
								quantity,
								overwrite: false,
							},
						],
					},
				}),
			"Lançamento registrado"
		)
		if (!posted) return false
		releaseEntryKey(entryKeys.current, line.key, clientEventId)
		setQuantities((current) => ({ ...current, [line.key]: "" }))
		return true
	}

	const { open, scannedInScope, inReview, divergent } = deriveCountState(sheet, scanned)

	return (
		<div className="space-y-4">
			<PageHeader
				title="Inventário Físico"
				description="Inventário com escopo, folha cega e aprovação por quem não contou. A cozinha continua trabalhando enquanto se conta."
			/>

			{!sheet && (
				<OpenCountCard
					busy={busy}
					type={type}
					onTypeChange={setType}
					scope={scope}
					onScopeChange={setScope}
					scopeValue={scopeValue}
					onScopeValueChange={setScopeValue}
					onOpen={() => {
						const params = buildScopeParams(scope, scopeValue)
						void run(() => openInventoryCountFn({ data: { kitchenId, type, scope: scope as "full", scopeParams: params } }), "Inventário aberto")
					}}
				/>
			)}

			{sheet && (
				<Card>
					<CountSheetHeader sheet={sheet} />
					<CardContent className="space-y-3">
						{open && (
							<ScanInput
								label="Código do item ou etiqueta do lote"
								placeholder="Leia o GTIN ou a etiqueta do lote…"
								disabled={busy}
								{...scannerPropsFrom(scannerProfile)}
								onReading={async (reading) => {
									// a leitura APONTA o alvo; a quantidade é sempre do operador,
									// porque a embalagem lida não diz quantas há na prateleira
									if (reading.kind !== "lot_label" && reading.kind !== "gtin") {
										toast.error("Código não reconhecido: leia o GTIN da embalagem ou a etiqueta do lote")
										return
									}
									try {
										const found = await resolveScanToIngredientFn({
											data: reading.kind === "lot_label" ? { kitchenId, lotShortCode: reading.lotShortCode } : { kitchenId, gtin: reading.gtin },
										})
										if (!found.ingredientId) {
											toast.error("Código não está no catálogo desta cozinha")
											return
										}
										setScanned({ ingredientId: found.ingredientId, lotId: found.lotId, description: found.description ?? "insumo" })
										setScannedQty("")
										requestAnimationFrame(() => document.querySelector<HTMLInputElement>("[data-count-qty=scanned]")?.focus())
									} catch (error) {
										toast.error(error instanceof Error ? error.message : "Erro ao resolver o código lido")
									}
								}}
							/>
						)}

						{open && scanned && (
							<ScannedTargetPanel
								scanned={scanned}
								scannedInScope={scannedInScope}
								scannedQty={scannedQty}
								onQtyChange={setScannedQty}
								busy={busy}
								onPost={async () => {
									const quantity = Number(scannedQty.replace(",", "."))
									if (!Number.isFinite(quantity) || quantity < 0) {
										toast.error("Informe a quantidade")
										return
									}
									const posted = await postLine(
										{
											key: `scan:${scanned.ingredientId}:${scanned.lotId ?? "item"}`,
											lotId: scanned.lotId,
											ingredientId: scanned.ingredientId,
											frozenPreparationId: null,
										},
										quantity
									)
									// na falha o alvo lido e a quantidade ficam, para reenviar com a mesma chave
									if (posted) setScanned(null)
								}}
								onAddFound={() =>
									run(() => addFoundItemFn({ data: { countId: sheet.count.id, ingredientId: scanned.ingredientId } }), "Achado incluído no inventário")
								}
								onCancel={() => setScanned(null)}
							/>
						)}

						<CountSheetTable
							sheet={sheet}
							open={open}
							busy={busy}
							quantities={quantities}
							onQuantityChange={(key, value) => setQuantities((current) => ({ ...current, [key]: value }))}
							onPost={(line) => {
								const quantity = Number((quantities[line.key] ?? "").replace(",", "."))
								if (!Number.isFinite(quantity) || quantity < 0) {
									toast.error("Informe a quantidade")
									return
								}
								void postLine(line, quantity)
							}}
						/>

						<CountActions
							open={open}
							inReview={inReview}
							divergentCount={divergent.length}
							busy={busy}
							onReview={() => run(() => reviewInventoryCountFn({ data: { countId: sheet.count.id } }), "Coleta encerrada")}
							onRecount={() =>
								run(
									() =>
										openRecountFn({
											data: {
												countId: sheet.count.id,
												ingredientIds: [...new Set(divergent.map((line) => line.ingredientId).filter(Boolean))] as string[],
												frozenPreparationIds: [...new Set(divergent.map((line) => line.frozenPreparationId).filter(Boolean))] as string[],
											},
										}),
									`Recontagem aberta com ${divergent.length} linha(s)`
								)
							}
							onApprove={() => {
								const exceptionReason =
									sheet.count.created_by == null
										? undefined
										: (window.prompt("Se você abriu este inventário, registre a exceção (deixe vazio para tentar sem):") ?? undefined)
								void run(async () => {
									const countId = sheet.count.id
									const reason = exceptionReason?.trim() || undefined
									const first = await approveInventoryCountFn({ data: { countId, exceptionReason: reason } })
									if (first.status === "approved") return first
									// Produção concluída sem saída lançada: a aprovação não trava — oferece a
									// ressalva, com TODOS os dias que o banco apontou (pelo código, não pelo texto).
									const days = formatPendingProductionDays(first.pendingDays)
									const waiver = window.prompt(
										`Produção concluída sem saída lançada${days ? ` em ${days}` : ""}: a contagem acusaria falta do que já saiu. Feche a requisição ou lance a saída tardia; para aprovar mesmo assim, registre a ressalva (mínimo 5 letras):`
									)
									if (!waiver || waiver.trim().length < 5) throw new Error(first.message)
									return approveInventoryCountFn({ data: { countId, exceptionReason: reason, pendingProductionWaiver: waiver.trim() } })
								}, "Inventário aprovado")
							}}
							onReject={() => {
								const reason = window.prompt("Motivo da rejeição (mínimo 5 caracteres):")
								if (!reason || reason.trim().length < 5) {
									toast.error("Rejeitar exige motivo")
									return
								}
								void run(() => rejectInventoryCountFn({ data: { countId: sheet.count.id, reason } }), "Inventário rejeitado")
							}}
						/>

						{inReview && sheet.notCounted > 0 && (
							<NotCountedPanel
								sheet={sheet}
								busy={busy}
								onToggle={(line) =>
									run(
										() =>
											acceptNotCountedFn({
												data: {
													countId: sheet.count.id,
													ingredientId: line.ingredientId ?? undefined,
													frozenPreparationId: line.ingredientId ? undefined : (line.frozenPreparationId ?? undefined),
													accepted: !line.notCountedAccepted,
												},
											}),
										line.notCountedAccepted ? "Marcação removida" : "Item aceito como não contado"
									)
								}
							/>
						)}
					</CardContent>
				</Card>
			)}

			<CountsHistoryCard list={list} />
		</div>
	)
}
