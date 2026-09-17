import { ISSUE_VARIANCE_REASON_LABELS, ISSUE_VARIANCE_REASONS, type IssueVarianceReason } from "@iefa/sisub-domain"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { CalendarDays, CheckCircle2, PackageMinus, Undo2 } from "lucide-react"
import { useState } from "react"
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
import { closeIssueRequestFn, fetchIssueRequestFn, issueStockFn, openIssueRequestFn, returnIssueFn, setVarianceReasonFn } from "@/server/issue.fn"
import { fetchScannerProfileFn } from "@/server/scanner.fn"
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

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/issue")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 2),
	loader: async ({ params }) => {
		const kitchenId = Number(params.kitchenId)
		const opened = await openIssueRequestFn({ data: { kitchenId, origin: "production" } })
		const [request, balance, scannerProfile] = await Promise.all([
			fetchIssueRequestFn({ data: { requestId: opened.requestId } }),
			fetchStockBalanceFn({ data: { kitchenId } }),
			fetchScannerProfileFn({ data: { kitchenId } }),
		])
		return { request, balance, scannerProfile }
	},
	component: DailyIssuePage,
	head: () => ({ meta: [{ title: "Estoque — Saída do dia" }] }),
})

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 })
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function newEmissionId(): string {
	return crypto.randomUUID()
}

function DailyIssuePage() {
	const { request, balance, scannerProfile } = Route.useLoaderData()
	const router = useRouter()
	const [busy, setBusy] = useState(false)
	const [quantities, setQuantities] = useState<Record<string, string>>({})

	const open = request.request.status === "open"
	const pending = request.lines.filter((line) => line.requiresReason && !line.hasReason)

	// ingredientes com saldo, para leitura e para a saída fora da sugestão
	const stockByIngredient = new Map(
		balance
			.filter((item) => item.ingredientId != null)
			.map((item) => [
				item.ingredientId as string,
				{
					description: item.description,
					measureUnit: item.measureUnit,
					available: item.balance - item.quarantinedBalance,
					gtins: [] as string[],
				},
			])
	)

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
		await run(
			() =>
				issueStockFn({
					data: { requestId: request.request.id, ingredientId, quantity, emissionId: newEmissionId() },
				}),
			`Saída de ${NUM.format(quantity)} registrada`
		)
		setQuantities((current) => ({ ...current, [ingredientId]: "" }))
	}

	return (
		<div className="space-y-4">
			<PageHeader
				title={`Saída do dia — ${request.request.issue_date}`}
				description="A produção sugere; você decide a quantidade. O motivo do desvio é pedido só no fechamento, e apenas onde ele é relevante."
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
								// leitura identifica o item; a quantidade continua sendo do
								// almoxarife — a embalagem lida não decide quanto vai sair
								if (reading.kind === "gtin" || reading.kind === "gs1") {
									toast.info("Informe a quantidade na linha do insumo abaixo")
								} else if (reading.kind === "lot_label") {
									toast.info(`Lote ${reading.lotShortCode} — informe a quantidade na linha do insumo`)
								} else {
									toast.error("Código não reconhecido")
								}
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
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{request.lines.length === 0 && (
						<p className="text-sm text-muted-foreground">
							Nenhuma produção planejada para hoje. A saída pode ser lançada mesmo assim — sem planejamento, não há variância a justificar.
						</p>
					)}
					{request.lines.map((line) => {
						const stock = stockByIngredient.get(line.ingredientId)
						return (
							<div key={line.ingredientId} className="rounded-xl border p-3 text-sm">
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
									<ReturnRow requestId={request.request.id} description={line.description} busy={busy} onDone={() => router.invalidate()} />
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

/** Devolução do que saiu e não foi usado — volta ao lote de origem. */
function ReturnRow({ requestId, description, busy, onDone }: { requestId: string; description: string; busy: boolean; onDone: () => void }) {
	const [quantity, setQuantity] = useState("")
	const [lotId, setLotId] = useState("")

	return (
		<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
			<Undo2 className="size-3.5 text-muted-foreground" />
			<span className="text-muted-foreground">Devolver ao estoque</span>
			<Input className="h-7 w-24" inputMode="decimal" placeholder="qtd" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
			<Input className="h-7 w-72 font-mono" placeholder="id do lote de origem" value={lotId} onChange={(event) => setLotId(event.target.value)} />
			<Button
				type="button"
				size="sm"
				variant="ghost"
				className="h-7"
				disabled={busy || !quantity || !lotId}
				onClick={async () => {
					const amount = Number(quantity.replace(",", "."))
					if (!Number.isFinite(amount) || amount <= 0) {
						toast.error("Informe a quantidade")
						return
					}
					try {
						const result = await returnIssueFn({ data: { requestId, lotId, quantity: amount, emissionId: newEmissionId() } })
						toast.success(`${description}: ${NUM.format(amount)} devolvido a ${BRL.format(result.unitCost)}/un`)
						setQuantity("")
						setLotId("")
						onDone()
					} catch (error) {
						toast.error(error instanceof Error ? error.message : "Erro ao devolver")
					}
				}}
			>
				Devolver
			</Button>
		</div>
	)
}
