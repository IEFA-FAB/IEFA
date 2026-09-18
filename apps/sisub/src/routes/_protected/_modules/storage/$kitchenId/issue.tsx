import { ISSUE_VARIANCE_REASON_LABELS, ISSUE_VARIANCE_REASONS, type IssueVarianceReason } from "@iefa/sisub-domain"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { CalendarDays, CheckCircle2, PackageMinus, RefreshCw, Undo2 } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { ScanInput } from "@/components/features/storage/scan/ScanInput"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import {
	closeIssueRequestFn,
	fetchIssueRequestFn,
	fetchReturnableLotsFn,
	fetchTodayIssueRequestFn,
	issueStockFn,
	openIssueRequestFn,
	returnIssueFn,
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
})

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/issue")({
	validateSearch: searchSchema,
	beforeLoad: (opts) => requirePermission(opts, "storage", 2),
	// LEITURA PURA. Com `defaultPreload: "intent"`, passar o mouse no link da
	// barra lateral chama o loader — e um loader que abre a requisição criava o
	// documento do dia sem ninguém ter clicado em nada.
	loaderDeps: ({ search }) => ({ origin: search.origin ?? "production" }),
	loader: async ({ params, deps }) => {
		const kitchenId = Number(params.kitchenId)
		const [today, balance, scannerProfile] = await Promise.all([
			fetchTodayIssueRequestFn({ data: { kitchenId, origin: deps.origin } }),
			fetchStockBalanceFn({ data: { kitchenId } }),
			fetchScannerProfileFn({ data: { kitchenId } }),
		])
		const request = today.requestId ? await fetchIssueRequestFn({ data: { requestId: today.requestId } }) : null
		return { request, balance, scannerProfile, origin: deps.origin }
	},
	component: DailyIssuePage,
	head: () => ({ meta: [{ title: "Estoque — Saída do dia" }] }),
})

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 })
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function DailyIssuePage() {
	const { request, balance, scannerProfile, origin } = Route.useLoaderData()
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
	const [extraIngredientId, setExtraIngredientId] = useState("")
	// linha apontada pela última leitura — some assim que a saída é lançada
	const [scannedIngredientId, setScannedIngredientId] = useState<string | null>(null)
	const [extraQuantity, setExtraQuantity] = useState("")

	const open = request?.request.status === "open"
	const pending = request?.lines.filter((line) => line.requiresReason && !line.hasReason) ?? []

	function emissionIdFor(key: string): string {
		const existing = emissionIds[key]
		if (existing) return existing
		const created = crypto.randomUUID()
		setEmissionIds((current) => ({ ...current, [key]: created }))
		return created
	}

	// ingredientes com saldo, para leitura e para a saída fora da sugestão
	const stockByIngredient = new Map(
		balance
			.filter((item) => item.ingredientId != null)
			.map((item) => [
				item.ingredientId as string,
				{
					description: item.description,
					measureUnit: item.measureUnit,
					// Vencido sai da conta junto com a quarentena: a alocação pula os
					// dois. Descontar só um oferecia saldo que `issue_stock` nunca
					// tocaria, e a baixa saía inteira como movimento sem lote.
					available: item.balance - item.quarantinedBalance - item.expiredBalance,
					gtins: [] as string[],
				},
			])
	)

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
			const inSuggestion = request?.lines.some((line) => line.ingredientId === ingredientId) ?? false
			if (!inSuggestion) {
				if (!stockByIngredient.has(ingredientId)) {
					toast.error(`${label} não tem saldo nesta cozinha`)
					return
				}
				setExtraIngredientId(ingredientId)
				toast.info(`${label} — fora da sugestão do dia. Informe a quantidade`)
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
		const emissionId = emissionIdFor(`${ingredientId}:${quantity}`)
		setBusy(true)
		try {
			const result = await issueStockFn({ data: { requestId: request.request.id, ingredientId, quantity, emissionId } })
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
				const { [`${ingredientId}:${quantity}`]: _discarded, ...rest } = current
				return rest
			})
			setQuantities((current) => ({ ...current, [ingredientId]: "" }))
			// a leitura terminou o trabalho dela: o destaque sai com a emissão, senão
			// a próxima leitura aponta para uma linha e outra fica acesa
			setScannedIngredientId(null)
			await router.invalidate()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro na saída")
		} finally {
			setBusy(false)
		}
	}

	if (!request) {
		return (
			<div className="space-y-4">
				<PageHeader title="Saída do dia" description="Nenhuma requisição aberta hoje nesta cozinha." />
				<Card>
					<CardContent className="space-y-3 pt-4 text-sm">
						<p>
							A requisição do dia reúne o que sai do estoque hoje. Ela é criada quando você abre — nunca sozinha, para a cozinha não acordar com documentos que
							ninguém pediu.
						</p>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								disabled={busy}
								onClick={() => {
									if (origin === "ad_hoc") {
										const purpose = window.prompt("Motivo da saída avulsa (evento, apoio, instrução)")
										if (!purpose?.trim()) return
										const destination = window.prompt("Destino") ?? ""
										run(
											() =>
												openIssueRequestFn({
													data: { kitchenId: Number(kitchenId), origin: "ad_hoc", purpose, destination: destination.trim() || undefined },
												}),
											"Saída avulsa aberta"
										)
										return
									}
									run(() => openIssueRequestFn({ data: { kitchenId: Number(kitchenId), origin: "production" } }), "Requisição do dia aberta")
								}}
							>
								{origin === "ad_hoc" ? "Abrir saída avulsa de hoje" : "Abrir a requisição de hoje"}
							</Button>
							<Button type="button" variant="ghost" onClick={() => navigate({ to: ".", search: { origin: origin === "ad_hoc" ? "production" : "ad_hoc" } })}>
								{origin === "ad_hoc" ? "Ver a saída da produção" : "Saída avulsa (evento, apoio)"}
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<div className="space-y-4">
			<PageHeader
				title={`${origin === "ad_hoc" ? "Saída avulsa" : "Saída do dia"} — ${request.request.issue_date}`}
				description={
					origin === "ad_hoc"
						? `Saída sem cardápio atrás: ${request.request.purpose ?? "sem motivo registrado"}. Ela não entra na variância do dia.`
						: "A produção sugere; você decide a quantidade. O motivo do desvio é pedido só no fechamento, e apenas onde ele é relevante."
				}
			>
				{open ? (
					<Button
						type="button"
						disabled={busy || pending.length > 0}
						onClick={() => run(() => closeIssueRequestFn({ data: { requestId: request.request.id } }), "Dia fechado")}
					>
						<CheckCircle2 className="mr-2 size-4" />
						Fechar o dia
					</Button>
				) : (
					<Badge variant="secondary">{request.request.status === "closed" ? "Fechado" : "Fechado sem justificativa"}</Badge>
				)}
			</PageHeader>

			{pending.length > 0 && (
				<Card className="border-warning">
					<CardContent className="pt-4 text-sm">
						{pending.length} linha(s) com desvio relevante esperando motivo. Tolerância desta cozinha: {request.settings.tolerancePct}% e{" "}
						{BRL.format(request.settings.toleranceFloorValue)} — abaixo dos dois, o desvio não é considerado.
					</CardContent>
				</Card>
			)}

			{open && (
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="flex items-center gap-2 text-subheading">
							<PackageMinus className="size-4" />
							Retirar
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<ScanInput
							label="Código do insumo"
							placeholder="Leia o GTIN da embalagem ou a etiqueta do lote…"
							disabled={busy}
							config={{
								prefix: scannerProfile.prefix ?? undefined,
								suffix: scannerProfile.suffix ?? undefined,
								gsSubstitute: scannerProfile.gsSubstitute ?? undefined,
							}}
							onReading={(reading) => {
								// A leitura APONTA a linha; a quantidade continua sendo do
								// almoxarife — a embalagem lida não decide quanto vai sair.
								// Antes daqui a leitura só mandava "informe a quantidade na
								// linha do insumo abaixo", e o operador lia o código e seguia
								// procurando a linha na mão: o trabalho que a leitura existe
								// para poupar.
								const gtin = reading.kind === "gtin" ? reading.gtin : reading.kind === "gs1" ? reading.fields.gtin : null
								if (gtin) {
									void selectByScan({ gtin })
									return
								}
								if (reading.kind === "lot_label") {
									void selectByScan({ lotShortCode: reading.lotShortCode })
									return
								}
								// A chave de NF-e É reconhecida — só não é deste lugar. Cair
								// em "Código não reconhecido" mandava o operador procurar
								// defeito no leitor que estava funcionando.
								if (reading.kind === "nfe_access_key") {
									toast.error("Isto é uma chave de NF-e. Entrada de material é na tela de Recebimento")
									return
								}
								toast.error("Código não reconhecido")
							}}
						/>
						<p className="text-xs text-muted-foreground">
							Os lotes são escolhidos automaticamente: o que vence primeiro, ignorando vencido e o que está em quarentena.
						</p>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="flex items-center gap-2 text-subheading">
						<CalendarDays className="size-4" />
						Itens do dia
						{open && origin === "production" && (
							/*
							 * A sugestão é escrita quando a requisição é aberta. Quem abre o
							 * documento ANTES de a produção lançar as tarefas do dia — o que
							 * é o normal em cozinha que planeja de manhã — fica com zero
							 * linhas sugeridas para sempre, e o portão de variância,
							 * justificativa e fechamento nasce vazio sem nenhum sinal na
							 * tela. Este botão é a única forma de recalcular.
							 */
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="ml-auto"
								disabled={busy}
								onClick={() =>
									run(
										() => openIssueRequestFn({ data: { kitchenId: Number(kitchenId), origin: "production" } }),
										"Sugestão recalculada com o planejamento de agora"
									)
								}
							>
								<RefreshCw className="mr-1 size-3.5" />
								Recalcular sugestão
							</Button>
						)}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{request.lines.length === 0 && (
						<p className="text-sm text-muted-foreground">
							Nenhuma produção planejada para este dia — ou a requisição foi aberta antes de a produção lançar as tarefas. "Recalcular sugestão" busca o
							planejamento de agora. A saída pode ser lançada mesmo sem sugestão, no campo abaixo; sem planejamento não há variância a justificar.
						</p>
					)}

					{open && (
						<div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed p-3">
							<div className="min-w-72 flex-1 space-y-1">
								<Label htmlFor="extra">Retirar insumo fora da sugestão</Label>
								<Select value={extraIngredientId || null} onValueChange={(value) => setExtraIngredientId(value ?? "")}>
									<SelectTrigger id="extra">
										<SelectValue>{stockByIngredient.get(extraIngredientId)?.description ?? "Escolha o insumo"}</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{[...stockByIngredient.entries()]
											.filter(([, item]) => item.available > 0)
											.map(([ingredientId, item]) => (
												<SelectItem key={ingredientId} value={ingredientId}>
													{item.description} · {NUM.format(item.available)} {item.measureUnit ?? ""}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							</div>
							<Input
								className="w-28"
								inputMode="decimal"
								placeholder="quantidade"
								data-issue-qty="extra"
								value={extraQuantity}
								onChange={(event) => setExtraQuantity(event.target.value)}
							/>
							<Button
								type="button"
								disabled={busy || !extraIngredientId}
								onClick={async () => {
									const quantity = Number(extraQuantity.replace(",", "."))
									if (!Number.isFinite(quantity) || quantity <= 0) {
										toast.error("Informe a quantidade")
										return
									}
									await emit(extraIngredientId, quantity)
									setExtraQuantity("")
								}}
							>
								Retirar
							</Button>
						</div>
					)}
					{request.lines.map((line) => {
						const stock = stockByIngredient.get(line.ingredientId)
						// A linha lida precisa se distinguir SEM faixa lateral colorida:
						// borda inteira e um leve tint de fundo. Só o foco no campo não
						// basta numa lista longa — o operador está olhando a prateleira,
						// não a tela, quando o leitor apita.
						const scanned = scannedIngredientId === line.ingredientId
						return (
							<div key={line.ingredientId} className={scanned ? "rounded-xl border border-primary bg-primary/5 p-3 text-sm" : "rounded-xl border p-3 text-sm"}>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div>
										<strong>{line.description}</strong>
										<span className="ml-2 text-xs text-muted-foreground">
											sugerido {line.suggestedQty != null ? NUM.format(line.suggestedQty) : "—"} · saiu {NUM.format(line.issuedNetQty)} {line.measureUnit ?? ""}
											{stock && ` · disponível ${NUM.format(stock.available)}`}
										</span>
									</div>
									<div className="flex items-center gap-2">
										{line.requiresReason && !line.hasReason && (
											<Badge variant="outline" className="text-warning">
												desvio {line.deltaPct}% · {BRL.format(line.deltaValue)}
											</Badge>
										)}
										{open && (
											<>
												<Input
													className="w-28"
													inputMode="decimal"
													placeholder="quantidade"
													data-issue-qty={line.ingredientId}
													value={quantities[line.ingredientId] ?? ""}
													onChange={(event) => setQuantities((current) => ({ ...current, [line.ingredientId]: event.target.value }))}
												/>
												<Button
													type="button"
													size="sm"
													disabled={busy}
													onClick={() => {
														const quantity = Number((quantities[line.ingredientId] ?? "").replace(",", "."))
														if (!Number.isFinite(quantity) || quantity <= 0) {
															toast.error("Informe a quantidade")
															return
														}
														emit(line.ingredientId, quantity)
													}}
												>
													Retirar
												</Button>
											</>
										)}
									</div>
								</div>

								{open && line.issuedNetQty > 0 && (
									<ReturnRow
										requestId={request.request.id}
										ingredientId={line.ingredientId}
										description={line.description}
										busy={busy}
										version={line.issuedNetQty}
										onDone={() => router.invalidate()}
									/>
								)}

								{line.requiresReason && line.itemId && (
									<div className="mt-2 flex flex-wrap items-center gap-2">
										<Label htmlFor={`reason-${line.itemId}`} className="text-xs">
											Motivo do desvio
										</Label>
										<Select
											value={(line.reason as IssueVarianceReason | null) ?? null}
											onValueChange={(value) => {
												if (!value || !line.itemId) return
												run(
													() => setVarianceReasonFn({ data: { itemId: line.itemId as string, reason: value as IssueVarianceReason, note: undefined } }),
													"Motivo registrado"
												)
											}}
										>
											<SelectTrigger id={`reason-${line.itemId}`} className="w-72">
												<SelectValue>{line.reason ? ISSUE_VARIANCE_REASON_LABELS[line.reason as IssueVarianceReason] : "Escolha o motivo"}</SelectValue>
											</SelectTrigger>
											<SelectContent>
												{ISSUE_VARIANCE_REASONS.filter((reason) => reason !== "other").map((reason) => (
													<SelectItem key={reason} value={reason}>
														{ISSUE_VARIANCE_REASON_LABELS[reason]}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
							</div>
						)
					})}
				</CardContent>
			</Card>
		</div>
	)
}

/**
 * Devolução do que saiu e não foi usado — volta ao lote de origem.
 *
 * O lote vem de uma LISTA dos que esta requisição emitiu deste insumo, e não
 * de um campo de texto. O campo aceitava um UUID digitado à mão, e a tela
 * nunca mostrou um: o operador colava um identificador de outro lugar e a
 * devolução caía em outro insumo enquanto o aviso nomeava a linha atual. O
 * banco impede devolver mais do que saiu, mas não impede devolver no item
 * errado — e esse erro só apareceria na contagem, semanas depois.
 */
function ReturnRow({
	requestId,
	ingredientId,
	description,
	busy,
	version,
	onDone,
}: {
	requestId: string
	ingredientId: string
	description: string
	busy: boolean
	/** Muda a cada saída ou devolução da linha — refaz a lista de lotes devolvíveis. */
	version: number
	onDone: () => void
}) {
	const [quantity, setQuantity] = useState("")
	const [lotId, setLotId] = useState("")
	// mesmo raciocínio da emissão: o identificador sobrevive ao erro, para que a
	// segunda tentativa depois de um 502 seja a MESMA devolução
	const [emissionId, setEmissionId] = useState(() => crypto.randomUUID())
	// Trava o botão enquanto a devolução viaja: dois cliques eram duas chamadas
	// com o mesmo identificador, e o operador via sucesso e erro juntos.
	const [returning, setReturning] = useState(false)
	const { data: returnable } = useQuery({
		// A versão da requisição entra na chave. `router.invalidate()` não toca o
		// cache do React Query: sem isto a lista não enxergava o lote de uma saída
		// nova nem o saldo que uma devolução parcial já consumiu.
		queryKey: ["returnable-lots", requestId, ingredientId, version],
		queryFn: () => fetchReturnableLotsFn({ data: { requestId, ingredientId } }),
	})
	const lots = returnable?.lots ?? []

	if (lots.length === 0) return null

	return (
		<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
			<Undo2 className="size-3.5 text-muted-foreground" />
			<span className="text-muted-foreground">Devolver ao estoque</span>
			<Input className="h-7 w-24" inputMode="decimal" placeholder="qtd" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
			<Select value={lotId || null} onValueChange={(value) => setLotId(value ?? "")}>
				<SelectTrigger className="h-7 w-72">
					<SelectValue>{lots.find((lot) => lot.lotId === lotId)?.label ?? "Lote de origem"}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{lots.map((lot) => (
						<SelectItem key={lot.lotId} value={lot.lotId}>
							{lot.label} · saiu {NUM.format(lot.returnable)}
							{lot.expiryDate ? ` · vence ${lot.expiryDate}` : ""}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				type="button"
				size="sm"
				variant="ghost"
				className="h-7"
				disabled={busy || returning || !quantity || !lotId}
				onClick={async () => {
					const amount = Number(quantity.replace(",", "."))
					if (!Number.isFinite(amount) || amount <= 0) {
						toast.error("Informe a quantidade")
						return
					}
					setReturning(true)
					try {
						const result = await returnIssueFn({ data: { requestId, lotId, quantity: amount, emissionId } })
						toast.success(`${description}: ${NUM.format(amount)} devolvido a ${BRL.format(result.unitCost)}/un`)
						setQuantity("")
						setLotId("")
						setEmissionId(crypto.randomUUID())
						onDone()
					} catch (error) {
						toast.error(error instanceof Error ? error.message : "Erro ao devolver")
					} finally {
						setReturning(false)
					}
				}}
			>
				Devolver
			</Button>
		</div>
	)
}
