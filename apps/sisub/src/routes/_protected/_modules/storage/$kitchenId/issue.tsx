import { getBrasiliaToday, type IssueVarianceReason } from "@iefa/sisub-domain"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import {
	AdHocSwitcher,
	DayItemsTitle,
	ExtraIngredientRow,
	IssueGapsCard,
	IssueLineRow,
	IssueStatusAction,
	NoIssueRequestView,
	PendingReasonsCard,
	type ScannedLot,
	UnexplainedDaysBanner,
	WithdrawScanCard,
} from "@/components/features/storage/issue/DailyIssueSections"
import {
	buildStockByIngredient,
	deriveIssueState,
	describeIssueHeader,
	isExtraWithoutStock,
	NUM,
	readUnexplainedDay,
} from "@/components/features/storage/issue/daily-issue"
import type { IssuableIngredient } from "@/components/features/storage/issue/IngredientSearchCombobox"
import { LateIssueCard } from "@/components/features/storage/issue/LateIssueCard"
import { UnexplainedDayCard } from "@/components/features/storage/issue/UnexplainedDayCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { toast } from "@/components/ui/toast"
import {
	closeIssueRequestFn,
	fetchIssueDayGapsFn,
	fetchIssueRequestFn,
	fetchTodayIssueRequestFn,
	issueStockFn,
	listUnexplainedIssueDaysFn,
	openIssueRequestFn,
	setVarianceReasonFn,
} from "@/server/issue.fn"
import { fetchScannerProfileFn, resolveScanToIngredientFn } from "@/server/scanner.fn"
import { fetchStockBalanceFn } from "@/server/stock.fn"

/**
 * Saída do dia.
 *
 * A produção SUGERE, o almoxarife DECIDE. Sair a menos ou a mais é normal — o
 * efetivo muda, a produção rende diferente — e por isso a tela não trava
 * quantidade nenhuma. O motivo do desvio é pedido UMA VEZ, no fechamento, e só
 * onde o desvio passa da tolerância e do piso da cozinha: pedir justificativa a
 * cada ida ao estoque é o que ensina todo mundo a marcar "outro".
 */

/**
 * `origin=ad_hoc` abre a saída AVULSA do dia — evento, apoio a instrução,
 * lanche fora do cardápio. É documento separado da requisição da produção de
 * propósito: misturar as duas contaminaria a variância do dia com saída que
 * nenhum cardápio previu.
 */
const searchSchema = z.object({
	origin: z.enum(["production", "ad_hoc"]).catch("production").optional(),
	/** Avulsa escolhida — pode haver várias no dia. */
	requestId: z.uuid().optional().catch(undefined),
	/** Dia de uma requisição passada (a que fechou sozinha e pede justificativa). Sem ele, hoje. */
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.catch(undefined),
})

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/issue")({
	validateSearch: searchSchema,
	beforeLoad: (opts) => requirePermission(opts, "storage", 2),
	// LEITURA PURA. Com `defaultPreload: "intent"`, passar o mouse no link da
	// barra lateral chama o loader — e um loader que abre a requisição criava o
	// documento do dia sem ninguém ter clicado em nada.
	loaderDeps: ({ search }) => ({ origin: search.origin ?? "production", requestId: search.requestId, date: search.date }),
	loader: async ({ params, deps }) => {
		const kitchenId = Number(params.kitchenId)
		const [today, balance, scannerProfile] = await Promise.all([
			fetchTodayIssueRequestFn({
				data: { kitchenId, origin: deps.origin, requestId: deps.origin === "ad_hoc" ? deps.requestId : undefined, issueDate: deps.date },
			}),
			fetchStockBalanceFn({ data: { kitchenId, operation: true } }),
			fetchScannerProfileFn({ data: { kitchenId } }),
		])
		const request = today.requestId ? await fetchIssueRequestFn({ data: { requestId: today.requestId } }) : null
		return { request, balance, scannerProfile, origin: deps.origin, adHocToday: today.adHocToday }
	},
	component: DailyIssuePage,
})

function DailyIssuePage() {
	const { request, balance, scannerProfile, origin, adHocToday } = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	const router = useRouter()
	const navigate = useNavigate()
	const [busy, setBusy] = useState(false)
	const [quantities, setQuantities] = useState<Record<string, string>>({})
	// Identificador de emissão POR LINHA, mantido até a emissão dar certo. Gerar
	// um novo a cada clique anulava a idempotência que a coluna `emission_id`
	// existe para dar: depois de um 502, a segunda tentativa retirava de novo.
	const [emissionIds, setEmissionIds] = useState<Record<string, string>>({})
	// insumo fora da sugestão (cozinha sem planejamento, retirada extra)
	const [extraIngredient, setExtraIngredient] = useState<IssuableIngredient | null>(null)
	const extraIngredientId = extraIngredient?.id ?? ""
	// linha apontada pela última leitura — some assim que a saída é lançada
	const [scannedIngredientId, setScannedIngredientId] = useState<string | null>(null)
	// Lote lido na etiqueta: a saída daquele insumo sai DESSE lote, o que está
	// na mão do operador — e não do que a alocação automática escolheria.
	const [scannedLot, setScannedLot] = useState<ScannedLot | null>(null)
	const [extraQuantity, setExtraQuantity] = useState("")

	const today = getBrasiliaToday()
	const { open, pending, issueDate, requestId, requestStatus } = deriveIssueState(request, today)

	// Preparações do dia com ficha que não dá sugestão: o aviso que faltava na sugestão vazia.
	const { data: gaps } = useQuery({
		queryKey: ["issue-day-gaps", kitchenId, issueDate, requestId],
		queryFn: () => fetchIssueDayGapsFn({ data: { kitchenId: Number(kitchenId), issueDate } }),
		enabled: origin === "production",
	})
	const { data: unexplainedDays } = useQuery({
		queryKey: ["unexplained-issue-days", kitchenId, requestStatus],
		queryFn: () => listUnexplainedIssueDaysFn({ data: { kitchenId: Number(kitchenId) } }),
	})

	function emissionIdFor(key: string): string {
		const existing = emissionIds[key]
		if (existing) return existing
		const created = crypto.randomUUID()
		setEmissionIds((current) => ({ ...current, [key]: created }))
		return created
	}

	// ingredientes com saldo, para leitura e para a saída fora da sugestão
	const stockByIngredient = buildStockByIngredient(balance)

	// Saída fora da sugestão: qualquer insumo do catálogo, buscado no servidor. A tela aceitava
	// só saldo > 0, e o banco já aceitava a saída sem lote ("regularizar na contagem"): o saco
	// na mão do almoxarife não saía porque o sistema estava atrasado.
	const availableById = new Map([...stockByIngredient.entries()].map(([id, stock]) => [id, stock.available]))
	const extraWithoutStock = isExtraWithoutStock(stockByIngredient, extraIngredientId)

	/**
	 * Leva a leitura até a linha: resolve o insumo, põe o foco no campo de
	 * quantidade e o destaca. Insumo que tem saldo mas não está na sugestão do
	 * dia cai no campo "fora da sugestão" — é o hortifrúti extra que ninguém
	 * planejou, e mandar o operador escolher de novo num select de 300 itens
	 * depois de já ter lido o código é pedir para ele desistir da leitura.
	 */
	async function selectByScan(input: { gtin?: string; lotShortCode?: string }) {
		try {
			const found = await resolveScanToIngredientFn({ data: { kitchenId: Number(kitchenId), ...input } })
			if (!found.ingredientId) {
				toast.error(
					input.lotShortCode
						? `Etiqueta ${input.lotShortCode} não é desta cozinha`
						: "Código não está no catálogo desta cozinha. Associe-o ao insumo no recebimento"
				)
				return
			}
			const ingredientId = found.ingredientId
			const label = found.description ?? "insumo"
			setScannedIngredientId(ingredientId)
			// só a etiqueta de LOTE fixa o lote; o GTIN da embalagem não diz qual é
			setScannedLot(found.matchedBy === "lot" && found.lotId ? { ingredientId, lotId: found.lotId, description: label } : null)
			const inSuggestion = request?.lines.some((line) => line.ingredientId === ingredientId) ?? false
			if (!inSuggestion) {
				setExtraIngredient({ id: ingredientId, description: label, measure_unit: stockByIngredient.get(ingredientId)?.measureUnit ?? null })
				if (!stockByIngredient.has(ingredientId)) {
					// Sem saldo no sistema não é "não sai": entra como falta a regularizar na contagem.
					toast.warning(`${label} — sem saldo registrado nesta cozinha: a saída entra como falta a regularizar na contagem. Informe a quantidade`)
				} else {
					toast.info(`${label} — fora da sugestão do dia. Informe a quantidade`)
				}
			} else {
				toast.info(`${label} — informe a quantidade`)
			}
			// o campo só existe depois do render que a seleção provoca
			requestAnimationFrame(() => {
				document.querySelector<HTMLInputElement>(`[data-issue-qty="${inSuggestion ? ingredientId : "extra"}"]`)?.focus()
			})
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao resolver o código lido")
		}
	}

	/** Cada avulsa é um documento novo; a tela passa a mostrar a que acabou de abrir. */
	async function openAdHoc(purpose: string, destination: string) {
		setBusy(true)
		try {
			const opened = await openIssueRequestFn({
				data: { kitchenId: Number(kitchenId), origin: "ad_hoc", purpose, destination: destination.trim() || undefined },
			})
			toast.success("Saída avulsa aberta")
			await navigate({ to: ".", search: { origin: "ad_hoc", requestId: opened.requestId } })
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao abrir a saída avulsa")
		} finally {
			setBusy(false)
		}
	}

	function promptAdHoc() {
		const purpose = window.prompt("Motivo da saída avulsa (evento, apoio, instrução)")
		if (!purpose?.trim()) return
		const destination = window.prompt("Destino") ?? ""
		openAdHoc(purpose, destination)
	}

	async function run(action: () => Promise<unknown>, success: string) {
		setBusy(true)
		try {
			await action()
			toast.success(success)
			await router.invalidate()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro na saída")
		} finally {
			setBusy(false)
		}
	}

	async function emit(ingredientId: string, quantity: number) {
		if (!request) return
		const lotId = scannedLot?.ingredientId === ingredientId ? scannedLot.lotId : null
		// o identificador é do PEDIDO inteiro — insumo, quantidade E lote: trocar
		// qualquer um é outra saída, e o banco recusa reaproveitar o identificador
		// a requisição entra na chave: a tentativa não confirmada na avulsa A não
		// pode emprestar o identificador para a avulsa B
		const emissionKey = `${request.request.id}:${ingredientId}:${quantity}:${lotId ?? "auto"}`
		const emissionId = emissionIdFor(emissionKey)
		setBusy(true)
		try {
			const result = await issueStockFn({
				data: {
					requestId: request.request.id,
					ingredientId,
					quantity,
					emissionId,
					...(lotId ? { overrideLotId: lotId, justification: "Lote lido na etiqueta pelo operador" } : {}),
				},
			})
			// `withoutLot` é a parte que não coube em lote nenhum: ela vira movimento
			// sem lote e estoque NEGATIVO até a contagem regularizar. Reportar isso
			// como sucesso puro é o começo de um estoque que ninguém confia.
			if (result.withoutLot > 0) {
				toast.warning(
					`Saída de ${NUM.format(quantity)} registrada, mas ${NUM.format(result.withoutLot)} saiu SEM LOTE: não havia saldo em lote válido. Regularize na contagem.`
				)
			} else {
				toast.success(`Saída de ${NUM.format(quantity)} registrada`)
			}
			// só descarta o identificador DEPOIS do sucesso: enquanto a emissão não
			// confirmou, repetir o clique tem de repetir o mesmo id
			setEmissionIds((current) => {
				const { [emissionKey]: _discarded, ...rest } = current
				return rest
			})
			setQuantities((current) => ({ ...current, [ingredientId]: "" }))
			// a leitura terminou o trabalho dela: o destaque sai com a emissão, senão
			// a próxima leitura aponta para uma linha e outra fica acesa
			setScannedIngredientId(null)
			setScannedLot(null)
			await router.invalidate()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro na saída")
		} finally {
			setBusy(false)
		}
	}

	if (!request) {
		return (
			<NoIssueRequestView
				origin={origin}
				busy={busy}
				kitchenId={Number(kitchenId)}
				today={today}
				availableById={availableById}
				unexplainedDays={unexplainedDays}
				onOpen={() => {
					if (origin === "ad_hoc") {
						promptAdHoc()
						return
					}
					run(() => openIssueRequestFn({ data: { kitchenId: Number(kitchenId), origin: "production" } }), "Requisição do dia aberta")
				}}
				onToggleOrigin={() => navigate({ to: ".", search: { origin: origin === "ad_hoc" ? "production" : "ad_hoc" } })}
				onRefresh={() => router.invalidate()}
			/>
		)
	}

	const header = describeIssueHeader(origin, request.request)
	const unexplainedDay = readUnexplainedDay(request.request)

	return (
		<div className="space-y-4">
			<PageHeader title={header.title} description={header.description}>
				<IssueStatusAction
					open={open}
					busy={busy}
					pendingCount={pending.length}
					status={request.request.status}
					onClose={() => run(() => closeIssueRequestFn({ data: { requestId: request.request.id } }), "Dia fechado")}
				/>
			</PageHeader>

			{origin === "production" && request.request.status === "closed_unexplained" && (
				<UnexplainedDayCard
					requestId={request.request.id}
					autoClosedAt={unexplainedDay.autoClosedAt}
					explainedAt={unexplainedDay.explainedAt}
					explanation={unexplainedDay.explanation}
					onDone={() => router.invalidate()}
				/>
			)}

			<UnexplainedDaysBanner days={(unexplainedDays ?? []).filter((day) => day.id !== request.request.id)} origin={origin} />

			<IssueGapsCard show={origin === "production"} gaps={gaps} />

			{origin === "ad_hoc" && (
				<AdHocSwitcher
					adHocToday={adHocToday}
					currentRequestId={request.request.id}
					busy={busy}
					onSelect={(adHocRequestId) => navigate({ to: ".", search: { origin: "ad_hoc", requestId: adHocRequestId } })}
					onNew={promptAdHoc}
				/>
			)}

			<PendingReasonsCard pendingCount={pending.length} settings={request.settings} />

			{open && (
				<WithdrawScanCard busy={busy} scannerProfile={scannerProfile} scannedLot={scannedLot} onScan={selectByScan} onClearLot={() => setScannedLot(null)} />
			)}

			<Card>
				<CardHeader className="pb-2">
					<DayItemsTitle
						canRecalculate={open && origin === "production"}
						busy={busy}
						onRecalculate={() =>
							run(
								() => openIssueRequestFn({ data: { kitchenId: Number(kitchenId), origin: "production" } }),
								"Sugestão recalculada com o planejamento de agora"
							)
						}
					/>
				</CardHeader>
				<CardContent className="space-y-2">
					{request.lines.length === 0 && (
						<p className="text-sm text-muted-foreground">
							Nenhuma produção planejada para este dia — ou a requisição foi aberta antes de a produção lançar as tarefas. "Recalcular sugestão" busca o
							planejamento de agora. A saída pode ser lançada mesmo sem sugestão, no campo abaixo; sem planejamento não há variância a justificar.
						</p>
					)}

					{open && (
						<ExtraIngredientRow
							kitchenId={Number(kitchenId)}
							extraIngredient={extraIngredient}
							onIngredientChange={setExtraIngredient}
							availableById={availableById}
							extraWithoutStock={extraWithoutStock}
							extraQuantity={extraQuantity}
							onQuantityChange={setExtraQuantity}
							busy={busy}
							extraIngredientId={extraIngredientId}
							onWithdraw={async () => {
								const quantity = Number(extraQuantity.replace(",", "."))
								if (!Number.isFinite(quantity) || quantity <= 0) {
									toast.error("Informe a quantidade")
									return
								}
								await emit(extraIngredientId, quantity)
								setExtraQuantity("")
							}}
						/>
					)}
					{request.lines.map((line) => (
						<IssueLineRow
							key={line.ingredientId}
							line={line}
							requestId={request.request.id}
							stock={stockByIngredient.get(line.ingredientId)}
							scanned={scannedIngredientId === line.ingredientId}
							open={open}
							busy={busy}
							quantity={quantities[line.ingredientId] ?? ""}
							onQuantityChange={(value) => setQuantities((current) => ({ ...current, [line.ingredientId]: value }))}
							onWithdraw={() => {
								const quantity = Number((quantities[line.ingredientId] ?? "").replace(",", "."))
								if (!Number.isFinite(quantity) || quantity <= 0) {
									toast.error("Informe a quantidade")
									return
								}
								emit(line.ingredientId, quantity)
							}}
							onReasonChange={(value) => {
								if (!value || !line.itemId) return
								run(
									() => setVarianceReasonFn({ data: { itemId: line.itemId as string, reason: value as IssueVarianceReason, note: undefined } }),
									"Motivo registrado"
								)
							}}
							onReturned={() => router.invalidate()}
						/>
					))}
				</CardContent>
			</Card>

			{origin === "production" && (
				<LateIssueCard kitchenId={Number(kitchenId)} today={today} availableById={availableById} onDone={() => router.invalidate()} />
			)}
		</div>
	)
}
