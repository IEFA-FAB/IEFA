import {
	CONSERVATION_LABELS,
	type ConservationClass,
	describeConditioning,
	isTemperatureOutOfRange,
	lotBalance,
	type PackageType,
	type ReceiptLotDraft,
	type TransportRequirement,
	temperatureVerdict,
} from "@iefa/sisub-domain"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { ArrowLeft, CheckCheck, ClipboardCheck, Plus, Printer, Thermometer, Trash2, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { requirePermission } from "@/auth/pbac"
import { GtinScannerField } from "@/components/features/global/gtin/GtinScannerField"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { deleteReceiptLotFn, fetchReceiptFn, finalizeReceiptFn, setReceiptProvisionalFn, updateReceiptItemFn, upsertReceiptLotFn } from "@/server/receiving.fn"

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/receiving/$receiptId")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loader: ({ params }) => fetchReceiptFn({ data: { receiptId: params.receiptId } }),
	component: ReceiptDetailPage,
	head: () => ({
		meta: [{ title: "Estoque — Conferência de Recebimento" }],
	}),
})

const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })

interface ReceiptLotRow {
	id: string
	lot_code: string
	expiry_date: string | null
	quantity_base: number
	unit_cost: number | null
	measured_temperature_c: number | null
	divergence_reason: string | null
	temperature_ack_by: string | null
}

interface ConditioningRow {
	conservation_class: ConservationClass | null
	storage_temp_min_c: number | null
	storage_temp_max_c: number | null
	package_type: PackageType | null
	package_net_content: number | null
	package_net_content_unit: string | null
	transport_requirement: TransportRequirement | null
	min_shelf_life_days_on_delivery: number | null
	delivery_conditioning: string | null
}

interface ReceiptItemRow {
	id: string
	description: string
	measure_unit: string | null
	gtin: string | null
	invoiced_qty_base: number | null
	received_qty_base: number
	divergence_reason: string | null
	conditioning: ConditioningRow | null
	lots: ReceiptLotRow[]
}

function requiredRange(conditioning: ConditioningRow | null) {
	return {
		minC: conditioning?.storage_temp_min_c != null ? Number(conditioning.storage_temp_min_c) : null,
		maxC: conditioning?.storage_temp_max_c != null ? Number(conditioning.storage_temp_max_c) : null,
	}
}

/**
 * Resumo do que a especificação de compra exige.
 *
 * Vive aqui porque o conferente é quem aceita ou recusa a carga, e até agora
 * essa exigência morria no formulário de compras: a tela mostrava quantidade,
 * lote e validade, e nada sobre em que condição o item tinha de chegar.
 */
function ConditioningSummary({ conditioning }: { conditioning: ConditioningRow | null }) {
	if (!conditioning) return null
	const summary = describeConditioning({
		conservationClass: conditioning.conservation_class,
		storageTempMinC: conditioning.storage_temp_min_c != null ? Number(conditioning.storage_temp_min_c) : null,
		storageTempMaxC: conditioning.storage_temp_max_c != null ? Number(conditioning.storage_temp_max_c) : null,
		minShelfLifeDaysOnDelivery: conditioning.min_shelf_life_days_on_delivery,
		packageType: conditioning.package_type,
		packageNetContent: conditioning.package_net_content != null ? Number(conditioning.package_net_content) : null,
		packageNetContentUnit: conditioning.package_net_content_unit,
		transportRequirement: conditioning.transport_requirement,
	})
	if (summary === "" && !conditioning.delivery_conditioning) return null

	return (
		<div className="mt-1 space-y-0.5">
			{summary !== "" && <p className="text-caption text-muted-foreground">Exigido: {summary}</p>}
			{conditioning.delivery_conditioning && <p className="text-caption text-muted-foreground whitespace-pre-line">{conditioning.delivery_conditioning}</p>}
		</div>
	)
}

/** Linha de lote em edição. Lote existente tem id; o rascunho de inclusão, não. */
function LotEditor({
	lot,
	itemId,
	editable,
	range,
	onSaved,
	onCancel,
}: {
	lot: ReceiptLotRow | null
	itemId: string
	editable: boolean
	range: { minC: number | null; maxC: number | null }
	onSaved: () => void
	onCancel?: () => void
}) {
	const [code, setCode] = useState(lot?.lot_code ?? "")
	const [expiry, setExpiry] = useState(lot?.expiry_date ?? "")
	const [quantity, setQuantity] = useState(lot != null ? String(lot.quantity_base) : "")
	const [temperature, setTemperature] = useState(lot?.measured_temperature_c != null ? String(lot.measured_temperature_c) : "")
	const [busy, setBusy] = useState(false)

	const measured = temperature.trim() === "" ? null : Number(temperature)
	const verdict = temperatureVerdict(measured, range)
	const outOfRange = isTemperatureOutOfRange(verdict)

	async function save() {
		setBusy(true)
		try {
			// Fora da faixa não bloqueia: pede o aceite explícito e grava quem aceitou.
			const accept = outOfRange
				? window.confirm(`Temperatura ${measured} °C está fora da faixa exigida. Registrar o lote assim mesmo? O aceite fica registrado em seu nome.`)
				: false
			if (outOfRange && !accept) return

			await upsertReceiptLotFn({
				data: {
					lotId: lot?.id,
					receiptItemId: itemId,
					lotCode: code.trim(),
					expiryDate: expiry || null,
					quantityBase: Number(quantity),
					measuredTemperatureC: measured,
					acceptOutOfRange: accept,
				},
			})
			toast.success(lot ? "Lote atualizado" : "Lote adicionado")
			onCancel?.()
			onSaved()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao gravar lote")
		} finally {
			setBusy(false)
		}
	}

	async function remove() {
		if (!lot) return
		setBusy(true)
		try {
			await deleteReceiptLotFn({ data: { lotId: lot.id, receiptItemId: itemId } })
			toast.success("Lote removido")
			onSaved()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao remover lote")
		} finally {
			setBusy(false)
		}
	}

	return (
		<tr className={outOfRange ? "bg-destructive/5" : undefined}>
			<td className="py-1.5 px-2">
				<Input className="h-7 text-xs font-mono" placeholder="lote" value={code} disabled={!editable} onChange={(e) => setCode(e.target.value)} />
			</td>
			<td className="py-1.5 px-2 w-36">
				<Input type="date" className="h-7 text-xs" value={expiry} disabled={!editable} onChange={(e) => setExpiry(e.target.value)} />
			</td>
			<td className="py-1.5 px-2 w-28">
				<Input
					type="number"
					min="0"
					step="any"
					className="h-7 text-xs text-right"
					placeholder="qtd"
					value={quantity}
					disabled={!editable}
					onChange={(e) => setQuantity(e.target.value)}
				/>
			</td>
			<td className="py-1.5 px-2 w-32">
				<Input
					type="number"
					step="0.1"
					className="h-7 text-xs text-right"
					placeholder="°C (opcional)"
					value={temperature}
					disabled={!editable}
					onChange={(e) => setTemperature(e.target.value)}
				/>
			</td>
			<td className="py-1.5 px-2 w-40 text-xs">
				{verdict === "dentro" && <Badge variant="secondary">na faixa</Badge>}
				{outOfRange && (
					<Badge variant="destructive" className="gap-1">
						<Thermometer className="size-3" />
						fora da faixa
					</Badge>
				)}
				{verdict === "sem_faixa" && <span className="text-muted-foreground">sem faixa exigida</span>}
				{verdict === "nao_medido" && <span className="text-muted-foreground">não medido</span>}
				{lot?.temperature_ack_by && <span className="block text-[10px] text-muted-foreground">aceite registrado</span>}
			</td>
			<td className="py-1.5 px-2 w-28 text-right print:hidden">
				{editable && (
					<div className="flex justify-end gap-1">
						<Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={save}>
							{busy ? <Spinner className="size-3" /> : "Salvar"}
						</Button>
						{lot ? (
							<Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={remove} aria-label="Remover lote">
								<Trash2 className="size-3.5" />
							</Button>
						) : (
							<Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={onCancel}>
								Cancelar
							</Button>
						)}
					</div>
				)}
			</td>
		</tr>
	)
}

function ItemCard({ item, editable, highlighted, onSaved }: { item: ReceiptItemRow; editable: boolean; highlighted: boolean; onSaved: () => void }) {
	const [qty, setQty] = useState(String(item.received_qty_base))
	const [reason, setReason] = useState(item.divergence_reason ?? "")
	const [addingLot, setAddingLot] = useState(false)
	const [saving, setSaving] = useState(false)

	const invoiced = item.invoiced_qty_base != null ? Number(item.invoiced_qty_base) : null
	const diverges = invoiced != null && Number(qty) !== invoiced
	const range = requiredRange(item.conditioning)

	const drafts: ReceiptLotDraft[] = item.lots.map((lot) => ({
		lotCode: lot.lot_code,
		expiryDate: lot.expiry_date,
		quantityBase: Number(lot.quantity_base),
		measuredTemperatureC: lot.measured_temperature_c != null ? Number(lot.measured_temperature_c) : null,
	}))
	const balance = lotBalance(Number(qty) || 0, drafts)

	async function save() {
		setSaving(true)
		try {
			await updateReceiptItemFn({
				data: { receiptItemId: item.id, receivedQtyBase: Number(qty), divergenceReason: reason || null },
			})
			toast.success("Item conferido")
			onSaved()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao salvar item")
		} finally {
			setSaving(false)
		}
	}

	return (
		<Card className={highlighted ? "bg-success/10" : undefined}>
			<CardContent className="pt-4 space-y-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="text-sm font-medium">{item.description}</p>
						{item.gtin && <span className="block text-[10px] font-mono text-muted-foreground">{item.gtin}</span>}
						<ConditioningSummary conditioning={item.conditioning} />
					</div>

					<div className="flex items-end gap-3">
						<div className="text-right">
							<p className="text-caption text-muted-foreground">Faturado</p>
							<p className="text-sm tabular-nums">
								{invoiced != null ? NUM.format(invoiced) : "—"}
								{item.measure_unit && <span className="ml-1 text-muted-foreground">{item.measure_unit}</span>}
							</p>
						</div>
						<div className="w-28">
							<p className="text-caption text-muted-foreground">Recebido</p>
							<Input
								type="number"
								min="0"
								step="any"
								className="h-7 text-xs text-right"
								value={qty}
								disabled={!editable}
								onChange={(e) => setQty(e.target.value)}
							/>
						</div>
						{editable && (
							<Button size="sm" variant="ghost" className="h-7 text-xs print:hidden" disabled={saving} onClick={save}>
								{saving ? <Spinner className="size-3" /> : "Salvar"}
							</Button>
						)}
					</div>
				</div>

				{diverges && (
					<Input
						className="h-7 text-xs"
						placeholder="motivo da divergência (obrigatório)"
						value={reason}
						disabled={!editable}
						onChange={(e) => setReason(e.target.value)}
					/>
				)}

				<div className="rounded-md border border-border">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
								<th className="py-1.5 px-2 text-left text-label">Lote</th>
								<th className="py-1.5 px-2 text-left text-label w-36">Validade</th>
								<th className="py-1.5 px-2 text-left text-label w-28">Quantidade</th>
								<th className="py-1.5 px-2 text-left text-label w-32">Temperatura</th>
								<th className="py-1.5 px-2 text-left text-label w-40">Aferição</th>
								<th className="py-1.5 px-2 w-28 print:hidden" />
							</tr>
						</thead>
						<tbody className="divide-y divide-border/60">
							{item.lots.map((lot) => (
								<LotEditor key={lot.id} lot={lot} itemId={item.id} editable={editable} range={range} onSaved={onSaved} />
							))}
							{addingLot && <LotEditor lot={null} itemId={item.id} editable={editable} range={range} onSaved={onSaved} onCancel={() => setAddingLot(false)} />}
							{item.lots.length === 0 && !addingLot && (
								<tr>
									<td colSpan={6} className="py-3 px-2 text-xs text-muted-foreground">
										Sem lote lançado. A efetivação criará um lote sintético com a quantidade inteira — informe os lotes se a carga veio com validades
										diferentes.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>

				<div className="flex items-center justify-between gap-3">
					<p className="text-caption">
						{balance.status === "fecha" && <span className="text-muted-foreground">Lotes somam a quantidade conferida.</span>}
						{balance.status === "falta" && (
							<span className="inline-flex items-center gap-1 text-muted-foreground">
								<TriangleAlert className="size-3" />
								Faltam {NUM.format(balance.remaining)} para fechar com o recebido.
							</span>
						)}
						{balance.status === "excede" && (
							<span className="inline-flex items-center gap-1 text-destructive">
								<TriangleAlert className="size-3" />
								Lotes excedem o recebido em {NUM.format(Math.abs(balance.remaining))}.
							</span>
						)}
					</p>
					{editable && !addingLot && (
						<Button size="sm" variant="outline" className="h-7 gap-1 text-xs print:hidden" onClick={() => setAddingLot(true)}>
							<Plus className="size-3" />
							Adicionar lote
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	)
}

function ReceiptDetailPage() {
	const receipt = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	const router = useRouter()
	const [busy, setBusy] = useState(false)
	const [scannedGtin, setScannedGtin] = useState<string | null>(null)

	const items: ReceiptItemRow[] = receipt.items
	const editable = receipt.status === "draft" || receipt.status === "provisional"
	const scanMatch = scannedGtin != null && items.some((item) => item.gtin === scannedGtin)

	async function toProvisional() {
		setBusy(true)
		try {
			await setReceiptProvisionalFn({ data: { receiptId: receipt.id } })
			toast.success("Recebimento provisório registrado — estoque ainda não movimentado")
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha")
		} finally {
			setBusy(false)
		}
	}

	async function toDefinitive() {
		setBusy(true)
		try {
			const result = await finalizeReceiptFn({ data: { receiptId: receipt.id } })
			toast.success(`Recebimento definitivo: ${result.movements} lote(s)/movimento(s) criados`)
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha na efetivação")
		} finally {
			setBusy(false)
		}
	}

	const conservationTally = items.reduce<Record<string, number>>((tally, item) => {
		const cls = item.conditioning?.conservation_class
		if (cls) tally[cls] = (tally[cls] ?? 0) + 1
		return tally
	}, {})

	return (
		<div className="space-y-6">
			<div className="print:hidden">
				<PageHeader title="Conferência de Recebimento" description={`Situação: ${receipt.status}`}>
					<Button
						variant="ghost"
						size="sm"
						className="gap-1.5"
						render={<Link to="/storage/$kitchenId/receiving" params={{ kitchenId }} />}
						nativeButton={false}
					>
						<ArrowLeft className="size-4" />
						Voltar
					</Button>
					<Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
						<Printer className="size-4" />
						Termo de Recebimento
					</Button>
					{receipt.status === "draft" && (
						<Button size="sm" className="gap-1.5" disabled={busy} onClick={toProvisional}>
							{busy ? <Spinner className="size-4" /> : <ClipboardCheck className="size-4" />}
							Recebimento provisório
						</Button>
					)}
					{(receipt.status === "provisional" || receipt.status === "divergent") && (
						<Button size="sm" className="gap-1.5" disabled={busy} onClick={toDefinitive}>
							{busy ? <Spinner className="size-4" /> : <CheckCheck className="size-4" />}
							Efetivar definitivo
						</Button>
					)}
				</PageHeader>
			</div>

			{/* Cabeçalho do termo (só na impressão) */}
			<div className="hidden print:block">
				<h1 className="text-heading">Termo de Recebimento — {receipt.status === "definitive" ? "Definitivo" : "Provisório"}</h1>
				<p className="text-xs">Recebimento {receipt.id}</p>
				{receipt.provisional_at && <p className="text-xs">Provisório em: {new Date(receipt.provisional_at).toLocaleString("pt-BR")}</p>}
				{receipt.definitive_at && <p className="text-xs">Definitivo em: {new Date(receipt.definitive_at).toLocaleString("pt-BR")}</p>}
			</div>

			{Object.keys(conservationTally).length > 0 && (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-caption text-muted-foreground">Conservação exigida nesta entrega:</span>
					{Object.entries(conservationTally).map(([cls, count]) => (
						<Badge key={cls} variant="secondary" className="text-xs">
							{CONSERVATION_LABELS[cls as ConservationClass]} · {count} item(ns)
						</Badge>
					))}
				</div>
			)}

			{editable && (
				<Card className="print:hidden">
					<CardContent className="pt-4 space-y-1.5">
						<p className="text-label text-muted-foreground">Conferência por scanner — leia o código do produto físico:</p>
						<GtinScannerField onScan={setScannedGtin} placeholder="Escaneie o GTIN do volume recebido…" />
						{scannedGtin != null && (
							<Badge variant={scanMatch ? "secondary" : "destructive"} className="text-xs">
								{scanMatch ? `GTIN ${scannedGtin} consta na nota — item destacado` : `GTIN ${scannedGtin} NÃO consta nesta nota — não adicione sem conferir`}
							</Badge>
						)}
					</CardContent>
				</Card>
			)}

			<div className="space-y-4">
				{items.map((item) => (
					<ItemCard
						key={item.id}
						item={item}
						editable={editable}
						highlighted={scannedGtin != null && item.gtin === scannedGtin}
						onSaved={() => router.invalidate()}
					/>
				))}
			</div>
		</div>
	)
}
