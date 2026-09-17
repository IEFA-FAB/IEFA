import { NATURE_LABELS, OUTFLOW_REASONS, REASON_NATURE, STOCK_ADJUSTMENT_REASON_LABELS, type StockAdjustmentReason } from "@iefa/sisub-domain"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { AlertTriangle, Check, ShieldAlert, SlidersHorizontal, Trash2, X } from "lucide-react"
import { useState } from "react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { ScanInput } from "@/components/features/storage/scan/ScanInput"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import {
	approveAdjustmentFn,
	createAdjustmentFn,
	fetchLossReportFn,
	listAdjustmentsFn,
	listQuarantinedLotsFn,
	quarantineLotFn,
	rejectAdjustmentFn,
	releaseQuarantineFn,
} from "@/server/adjustment.fn"
import { fetchScannerProfileFn } from "@/server/scanner.fn"
import { fetchStockBalanceFn } from "@/server/stock.fn"

/**
 * Ajustes de estoque.
 *
 * O ajuste é a única porta para tirar ou pôr estoque fora de recebimento e
 * produção, e é por isso que ele exige motivo TIPADO: "estragou", "venceu" e
 * "furtado" têm consequências administrativas diferentes, e a última abre
 * apuração de responsabilidade. A tela existe porque o backend do ajuste
 * estava pronto e sem interface — o operador não tinha como registrar perda
 * nenhuma.
 *
 * A quarentena vem primeiro na tela de propósito: quando a câmara falha, o
 * urgente é tirar o lote da alocação; o ajuste (com aprovação, se passar da
 * alçada) vem depois.
 */

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/adjustments")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 2),
	loader: async ({ params }) => {
		const kitchenId = Number(params.kitchenId)
		const today = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10)
		const monthStart = `${today.slice(0, 7)}-01`
		const [balance, adjustments, quarantined, losses, scannerProfile] = await Promise.all([
			fetchStockBalanceFn({ data: { kitchenId } }),
			listAdjustmentsFn({ data: { kitchenId, limit: 30 } }),
			listQuarantinedLotsFn({ data: { kitchenId } }),
			fetchLossReportFn({ data: { kitchenId, from: monthStart, to: today } }),
			fetchScannerProfileFn({ data: { kitchenId } }),
		])
		return { balance, adjustments, quarantined, losses, scannerProfile, monthStart, today }
	},
	component: AdjustmentsPage,
	head: () => ({ meta: [{ title: "Estoque — Ajustes" }] }),
})

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 })
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

/** Motivos que o operador escolhe na tela. Inventário e abertura não entram: */
/** eles nascem da contagem e da carga, não de um ajuste digitado. */
const MANUAL_REASONS = OUTFLOW_REASONS.filter((reason) => reason !== "count_loss")

/** Linha da fila de quarentena, como a fn devolve. */
interface QuarantinedLot {
	id: string
	short_code: string | null
	lot_code: string | null
	description: string
	quarantine_reason: string | null
}

/** Documento de ajuste com seus itens, como a listagem devolve. */
interface AdjustmentRow {
	id: string
	status: string
	evidence_status: string
	created_at: string
	posted_value: number | null
	approval_exception_reason: string | null
	items: Array<Record<string, unknown>>
}

interface LotOption {
	lotId: string
	shortCode: string | null
	description: string
	lotCode: string | null
	expiryDate: string | null
	balance: number
	measureUnit: string | null
	quarantined: boolean
}

function AdjustmentsPage() {
	const { balance, adjustments, quarantined, losses, scannerProfile, monthStart, today } = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	const router = useRouter()
	// A rota abre no nível 2 (quem registra ajuste), mas aprovar, rejeitar e
	// liberar quarentena são nível 3. Sem esta distinção a tela oferecia botões
	// que o servidor recusa — e o operador aprende a desconfiar da tela.
	const { can } = usePBAC()
	const canApprove = can("storage", 3, { type: "kitchen", id: Number(kitchenId) })

	const lots: LotOption[] = balance.flatMap((item) =>
		item.lots
			.filter((lot) => lot.lot_id != null && lot.balance > 0)
			.map((lot) => ({
				lotId: lot.lot_id as string,
				shortCode: lot.short_code,
				description: item.description,
				lotCode: lot.lot_code,
				expiryDate: lot.expiry_date,
				balance: lot.balance,
				measureUnit: item.measureUnit,
				quarantined: lot.quarantined,
			}))
	)

	const [selectedLotId, setSelectedLotId] = useState<string>("")
	const [reason, setReason] = useState<StockAdjustmentReason>("expired")
	const [quantity, setQuantity] = useState("")
	const [note, setNote] = useState("")
	const [evidence, setEvidence] = useState("")
	const [temperature, setTemperature] = useState("")
	const [busy, setBusy] = useState(false)

	const selectedLot = lots.find((lot) => lot.lotId === selectedLotId)
	const nature = REASON_NATURE[reason]

	function selectByReading(code: string) {
		const match = lots.find((lot) => lot.shortCode === code)
		if (!match) {
			toast.error(`Etiqueta ${code} não corresponde a lote com saldo nesta cozinha`)
			return
		}
		setSelectedLotId(match.lotId)
		toast.success(`${match.description} · lote ${match.lotCode ?? match.shortCode}`)
	}

	async function submitAdjustment() {
		if (!selectedLot) {
			toast.error("Escolha o lote")
			return
		}
		const amount = Number(quantity.replace(",", "."))
		if (!Number.isFinite(amount) || amount <= 0) {
			toast.error("Informe a quantidade")
			return
		}
		setBusy(true)
		try {
			const result = await createAdjustmentFn({
				data: {
					kitchenId: Number(kitchenId),
					items: [
						{
							lotId: selectedLot.lotId,
							direction: "out",
							quantity: amount,
							reasonCode: reason,
							note: note.trim() || undefined,
							evidenceReference: evidence.trim() || undefined,
							evidenceKind: evidence.trim() ? "term" : undefined,
							measuredTemperatureC: temperature.trim() ? Number(temperature.replace(",", ".")) : undefined,
						},
					],
				},
			})
			toast.success(
				result.status === "posted" ? "Ajuste lançado" : "Ajuste registrado e aguardando aprovação — se o lote está comprometido, ponha-o em quarentena agora"
			)
			setQuantity("")
			setNote("")
			setEvidence("")
			setTemperature("")
			await router.invalidate()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao registrar o ajuste")
		} finally {
			setBusy(false)
		}
	}

	async function run(action: () => Promise<unknown>, success: string) {
		setBusy(true)
		try {
			await action()
			toast.success(success)
			await router.invalidate()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro na operação")
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="space-y-4">
			<PageHeader
				title="Ajustes de estoque"
				description="Perda, avaria, vencimento, extravio e correção. Todo ajuste tem motivo, e o que passa da alçada da cozinha espera aprovação."
			/>

			{quarantined.length > 0 && (
				<Card className="border-warning">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-warning">
							<ShieldAlert className="size-4" />
							{quarantined.length} lote(s) em quarentena
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<p className="text-sm text-muted-foreground">
							Lote em quarentena não é alocado em saída nem transferido. Resolva com um ajuste ou libere, se o problema não se confirmou.
						</p>
						{quarantined.map((lot: QuarantinedLot) => (
							<div key={lot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2 text-sm">
								<div>
									<strong>{lot.description}</strong> · {lot.short_code} · lote {lot.lot_code}
									<span className="block text-xs text-muted-foreground">{lot.quarantine_reason}</span>
								</div>
								<div className="flex gap-2">
									<Button
										type="button"
										size="sm"
										variant="outline"
										disabled={busy}
										onClick={() => {
											setSelectedLotId(lot.id)
											setReason("spoiled")
										}}
									>
										Baixar
									</Button>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										disabled={busy}
										onClick={() =>
											run(() => releaseQuarantineFn({ data: { lotId: lot.id, reason: "Problema não confirmado na avaliação" } }), "Quarentena liberada")
										}
									>
										Liberar
									</Button>
								</div>
							</div>
						))}
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Trash2 className="size-4" />
						Registrar ajuste
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<ScanInput
						label="Etiqueta do lote"
						placeholder="Leia a etiqueta do lote…"
						config={{
							prefix: scannerProfile.prefix ?? undefined,
							suffix: scannerProfile.suffix ?? undefined,
							gsSubstitute: scannerProfile.gsSubstitute ?? undefined,
						}}
						onReading={(reading) => {
							if (reading.kind === "lot_label") selectByReading(reading.lotShortCode)
							else toast.error("Leia a etiqueta interna do lote (o GTIN identifica o produto, não o lote)")
						}}
					/>

					<div className="grid gap-3 md:grid-cols-2">
						<div className="space-y-1">
							<Label htmlFor="lot">Lote</Label>
							<Select value={selectedLotId || null} onValueChange={(value) => setSelectedLotId(value ?? "")}>
								<SelectTrigger id="lot">
									<SelectValue>
										{selectedLot
											? `${selectedLot.description} · ${selectedLot.lotCode ?? selectedLot.shortCode} · ${NUM.format(selectedLot.balance)} ${selectedLot.measureUnit ?? ""}`
											: "Escolha o lote"}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{lots.map((lot) => (
										<SelectItem key={lot.lotId} value={lot.lotId}>
											{lot.description} · {lot.lotCode ?? lot.shortCode} · {NUM.format(lot.balance)} {lot.measureUnit ?? ""}
											{lot.expiryDate ? ` · val ${lot.expiryDate}` : ""}
											{lot.quarantined ? " · em quarentena" : ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-1">
							<Label htmlFor="reason">Motivo</Label>
							<Select value={reason} onValueChange={(value) => setReason((value ?? "expired") as StockAdjustmentReason)}>
								<SelectTrigger id="reason">
									<SelectValue>{STOCK_ADJUSTMENT_REASON_LABELS[reason]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{MANUAL_REASONS.map((value) => (
										<SelectItem key={value} value={value}>
											{STOCK_ADJUSTMENT_REASON_LABELS[value]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								Natureza: {NATURE_LABELS[nature]}
								{nature === "under_investigation" && " — o valor fica em apuração até o processo ser informado"}
							</p>
						</div>

						<div className="space-y-1">
							<Label htmlFor="quantity">Quantidade {selectedLot?.measureUnit ? `(${selectedLot.measureUnit})` : ""}</Label>
							<Input id="quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
						</div>

						{reason === "cold_chain_failure" ? (
							<div className="space-y-1">
								<Label htmlFor="temperature">Temperatura medida (°C)</Label>
								<Input id="temperature" inputMode="decimal" value={temperature} onChange={(event) => setTemperature(event.target.value)} />
							</div>
						) : (
							<div className="space-y-1">
								<Label htmlFor="evidence">Evidência (nº da parte, termo, processo, chave da NF-e)</Label>
								<Input id="evidence" value={evidence} maxLength={200} onChange={(event) => setEvidence(event.target.value)} />
								<p className="text-xs text-muted-foreground">Pode ser completada depois — o ajuste fica listado como pendente de evidência.</p>
							</div>
						)}

						<div className="space-y-1 md:col-span-2">
							<Label htmlFor="note">Observação</Label>
							<Input id="note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
						</div>
					</div>

					<div className="flex flex-wrap gap-2">
						<Button type="button" onClick={submitAdjustment} disabled={busy}>
							Registrar ajuste
						</Button>
						{selectedLot && !selectedLot.quarantined && (
							<Button
								type="button"
								variant="outline"
								disabled={busy}
								onClick={() =>
									run(
										() => quarantineLotFn({ data: { lotId: selectedLot.lotId, reason: note.trim() || "Lote sob avaliação" } }),
										"Lote em quarentena — fora da alocação"
									)
								}
							>
								<ShieldAlert className="mr-2 size-4" />
								Pôr em quarentena agora
							</Button>
						)}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<AlertTriangle className="size-4" />
						Perdas do mês ({monthStart} a {today})
					</CardTitle>
				</CardHeader>
				<CardContent>
					{losses.lines.length === 0 ? (
						<p className="text-sm text-muted-foreground">Nenhum ajuste no período.</p>
					) : (
						<>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Motivo</TableHead>
										<TableHead>Natureza</TableHead>
										<TableHead className="text-right">Quantidade</TableHead>
										<TableHead className="text-right">Valor</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{losses.lines.map((line) => (
										<TableRow key={line.reasonCode}>
											<TableCell>{STOCK_ADJUSTMENT_REASON_LABELS[line.reasonCode as StockAdjustmentReason] ?? line.reasonCode}</TableCell>
											<TableCell>
												{line.underInvestigation ? (
													<Badge variant="outline" className="text-warning">
														Em apuração
													</Badge>
												) : (
													NATURE_LABELS[REASON_NATURE[line.reasonCode as StockAdjustmentReason] ?? "loss"]
												)}
											</TableCell>
											<TableCell className="text-right tabular-nums">{NUM.format(line.quantity)}</TableCell>
											<TableCell className="text-right tabular-nums">{BRL.format(line.value)}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
							<p className="mt-2 text-sm">
								Total: <strong>{BRL.format(losses.totalValue)}</strong>
								{losses.underInvestigationValue > 0 && (
									<>
										{" "}
										· em apuração: <strong>{BRL.format(losses.underInvestigationValue)}</strong>
									</>
								)}
							</p>
						</>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<SlidersHorizontal className="size-4" />
						Ajustes recentes ({adjustments.total})
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{adjustments.adjustments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum ajuste registrado.</p>}
					{adjustments.adjustments.map((doc: AdjustmentRow) => (
						<div key={doc.id} className="rounded-xl border p-3 text-sm">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex items-center gap-2">
									<Badge variant={doc.status === "posted" ? "default" : doc.status === "rejected" ? "outline" : "secondary"}>
										{{ draft: "Rascunho", pending_approval: "Aguardando aprovação", posted: "Lançado", rejected: "Rejeitado" }[doc.status as string]}
									</Badge>
									{doc.evidence_status === "pending" && (
										<Badge variant="outline" className="text-warning">
											Evidência pendente
										</Badge>
									)}
									<span className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleString("pt-BR")}</span>
								</div>
								{doc.status === "pending_approval" && canApprove && (
									<div className="flex gap-2">
										<Button
											type="button"
											size="sm"
											disabled={busy}
											onClick={() => run(() => approveAdjustmentFn({ data: { adjustmentId: doc.id } }), "Ajuste aprovado e lançado")}
										>
											<Check className="mr-1 size-3.5" />
											Aprovar
										</Button>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											disabled={busy}
											onClick={() =>
												run(() => rejectAdjustmentFn({ data: { adjustmentId: doc.id, reason: "Rejeitado na conferência do responsável" } }), "Ajuste rejeitado")
											}
										>
											<X className="mr-1 size-3.5" />
											Rejeitar
										</Button>
									</div>
								)}
							</div>
							{doc.status === "pending_approval" && !canApprove && (
								<p className="mt-1 text-xs text-muted-foreground">Aguardando aprovação de um responsável nível 3 desta cozinha.</p>
							)}
							<ul className="mt-2 space-y-1 text-xs">
								{doc.items.map((item: Record<string, unknown>) => (
									<li key={String(item.id)}>
										{STOCK_ADJUSTMENT_REASON_LABELS[item.reason_code as StockAdjustmentReason] ?? String(item.reason_code)} ·{" "}
										{item.direction === "in" ? "+" : "−"}
										{NUM.format(Number(item.quantity))}
										{item.note ? ` · ${String(item.note)}` : ""}
										{item.investigation_reference ? ` · processo ${String(item.investigation_reference)}` : ""}
									</li>
								))}
							</ul>
							{doc.approval_exception_reason && <p className="mt-1 text-xs text-warning">Exceção de segregação: {String(doc.approval_exception_reason)}</p>}
							{doc.posted_value != null && <p className="mt-1 text-xs text-muted-foreground">Valor: {BRL.format(Number(doc.posted_value))}</p>}
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	)
}
