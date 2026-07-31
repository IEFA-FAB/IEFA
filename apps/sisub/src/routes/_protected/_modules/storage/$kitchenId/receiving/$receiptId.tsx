import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { ArrowLeft, CheckCheck, ClipboardCheck, Printer } from "lucide-react"
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
import { fetchReceiptFn, finalizeReceiptFn, setReceiptProvisionalFn, updateReceiptItemFn } from "@/server/receiving.fn"

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/receiving/$receiptId")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loader: ({ params }) => fetchReceiptFn({ data: { receiptId: params.receiptId } }),
	component: ReceiptDetailPage,
	head: () => ({
		meta: [{ title: "Estoque — Conferência de Recebimento" }],
	}),
})

const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })

interface ReceiptItemRow {
	id: string
	description: string
	measure_unit: string | null
	gtin: string | null
	invoiced_qty_base: number | null
	received_qty_base: number
	lot_code: string | null
	expiry_date: string | null
	divergence_reason: string | null
}

function ItemRow({ item, editable, highlighted, onSaved }: { item: ReceiptItemRow; editable: boolean; highlighted: boolean; onSaved: () => void }) {
	const [qty, setQty] = useState(String(item.received_qty_base))
	const [lot, setLot] = useState(item.lot_code ?? "")
	const [expiry, setExpiry] = useState(item.expiry_date ?? "")
	const [reason, setReason] = useState(item.divergence_reason ?? "")
	const [saving, setSaving] = useState(false)

	const invoiced = item.invoiced_qty_base != null ? Number(item.invoiced_qty_base) : null
	const diverges = invoiced != null && Number(qty) !== invoiced

	async function save() {
		setSaving(true)
		try {
			await updateReceiptItemFn({
				data: {
					receiptItemId: item.id,
					receivedQtyBase: Number(qty),
					lotCode: lot || undefined,
					expiryDate: expiry || null,
					divergenceReason: reason || null,
				},
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
		<tr className={highlighted ? "bg-success/10" : undefined}>
			<td className="py-2 px-3 text-xs">
				{item.description}
				{item.gtin && <span className="block text-[10px] font-mono text-muted-foreground">{item.gtin}</span>}
			</td>
			<td className="py-2 px-2 text-xs text-right tabular-nums">
				{invoiced != null ? NUM.format(invoiced) : "—"}
				{item.measure_unit && <span className="ml-1 text-muted-foreground">{item.measure_unit}</span>}
			</td>
			<td className="py-2 px-2 w-28">
				<Input type="number" min="0" step="any" className="h-7 text-xs text-right" value={qty} disabled={!editable} onChange={(e) => setQty(e.target.value)} />
			</td>
			<td className="py-2 px-2 w-32">
				<Input className="h-7 text-xs font-mono" placeholder="lote" value={lot} disabled={!editable} onChange={(e) => setLot(e.target.value)} />
			</td>
			<td className="py-2 px-2 w-36">
				<Input type="date" className="h-7 text-xs" value={expiry} disabled={!editable} onChange={(e) => setExpiry(e.target.value)} />
			</td>
			<td className="py-2 px-2">
				{diverges && (
					<Input
						className="h-7 text-xs"
						placeholder="motivo da divergência (obrigatório)"
						value={reason}
						disabled={!editable}
						onChange={(e) => setReason(e.target.value)}
					/>
				)}
			</td>
			<td className="py-2 px-2 w-20 text-right">
				{editable && (
					<Button size="sm" variant="ghost" className="h-7 text-xs" disabled={saving} onClick={save}>
						{saving ? <Spinner className="size-3" /> : "Salvar"}
					</Button>
				)}
			</td>
		</tr>
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

			<Card>
				<CardContent className="px-0 pb-0 pt-2">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
								<th className="py-2 px-3 text-left text-label">Item</th>
								<th className="py-2 px-2 text-right text-label w-32">Faturado (base)</th>
								<th className="py-2 px-2 text-left text-label w-28">Recebido</th>
								<th className="py-2 px-2 text-left text-label w-32">Lote</th>
								<th className="py-2 px-2 text-left text-label w-36">Validade</th>
								<th className="py-2 px-2 text-left text-label">Divergência</th>
								<th className="py-2 px-2 w-20 print:hidden" />
							</tr>
						</thead>
						<tbody className="divide-y divide-border/60">
							{items.map((item) => (
								<ItemRow
									key={item.id}
									item={item}
									editable={editable}
									highlighted={scannedGtin != null && item.gtin === scannedGtin}
									onSaved={() => router.invalidate()}
								/>
							))}
						</tbody>
					</table>
				</CardContent>
			</Card>
		</div>
	)
}
