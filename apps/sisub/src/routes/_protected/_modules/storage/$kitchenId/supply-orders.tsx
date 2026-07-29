import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Send, XCircle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { cancelSupplyOrderFn, createSupplyOrderFn, listEmpenhosForKitchenFn, listSupplyOrdersFn } from "@/server/supply-order.fn"

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/supply-orders")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 2),
	loader: async ({ params }) => {
		const kitchenId = Number(params.kitchenId)
		const [orders, empenhos] = await Promise.all([listSupplyOrdersFn({ data: { kitchenId } }), listEmpenhosForKitchenFn({ data: { kitchenId } })])
		return { orders, empenhos }
	},
	component: SupplyOrdersPage,
	head: () => ({
		meta: [{ title: "Estoque — Ordens de Fornecimento" }],
	}),
})

const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })

const STATUS_LABEL: Record<string, string> = {
	draft: "Rascunho",
	sent: "Enviada",
	partially_received: "Parcialmente recebida",
	received: "Recebida",
	cancelled: "Cancelada",
	expired: "Expirada",
}

function SupplyOrdersPage() {
	const { orders, empenhos } = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	const router = useRouter()
	const [busy, setBusy] = useState(false)
	const [empenhoId, setEmpenhoId] = useState("")
	const [qty, setQty] = useState("")
	const [expected, setExpected] = useState("")
	const [number, setNumber] = useState("")

	async function emit(e: React.FormEvent) {
		e.preventDefault()
		if (!empenhoId || !qty || !expected) return
		const empenho = empenhos.find((emp: { id: string }) => emp.id === empenhoId)
		setBusy(true)
		try {
			await createSupplyOrderFn({
				data: {
					empenhoId,
					kitchenId: Number(kitchenId),
					number: number || undefined,
					expectedDelivery: expected,
					items: [{ arpItemId: empenho?.arp_item_id ?? undefined, orderedQty: Number(qty), unitPrice: empenho?.valor_unitario ?? undefined }],
				},
			})
			toast.success("OF emitida")
			setEmpenhoId("")
			setQty("")
			setNumber("")
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao emitir OF")
		} finally {
			setBusy(false)
		}
	}

	async function cancel(supplyOrderId: string) {
		try {
			await cancelSupplyOrderFn({ data: { supplyOrderId } })
			toast.success("OF cancelada")
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao cancelar")
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Ordens de Fornecimento"
				description="A OF distribui o empenho da unidade para entrega nesta cozinha. A data prevista alimenta o lead time do planejamento."
			/>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Emitir OF</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={emit} className="grid gap-3 sm:grid-cols-5 items-end">
						<div className="space-y-1 sm:col-span-2">
							<Label className="text-xs">Empenho *</Label>
							{/* select nativo proibido? Base UI Select exige plumbing; lista curta → radios simples */}
							<div className="max-h-32 overflow-y-auto rounded-md border p-1 space-y-0.5">
								{empenhos.length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhum empenho ativo na unidade.</p>}
								{empenhos.map((emp: { id: string; numero_empenho: string; quantidade_empenhada: number }) => (
									<button
										key={emp.id}
										type="button"
										onClick={() => setEmpenhoId(emp.id)}
										className={`w-full text-left text-xs px-2 py-1 rounded ${empenhoId === emp.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
									>
										<span className="font-mono">{emp.numero_empenho}</span>
										<span className="text-muted-foreground ml-2">{NUM.format(Number(emp.quantidade_empenhada))} empenhado</span>
									</button>
								))}
							</div>
						</div>
						<div className="space-y-1">
							<Label className="text-xs">Nº OF</Label>
							<Input className="h-8 text-xs" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="OF-2026-001" />
						</div>
						<div className="space-y-1">
							<Label className="text-xs">Quantidade *</Label>
							<Input className="h-8 text-xs" type="number" min="0.0001" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required />
						</div>
						<div className="space-y-1">
							<Label className="text-xs">Entrega prevista *</Label>
							<Input className="h-8 text-xs" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} required />
						</div>
						<Button type="submit" size="sm" className="gap-1.5" disabled={busy || !empenhoId}>
							{busy ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />}
							Emitir
						</Button>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">OFs desta cozinha</CardTitle>
				</CardHeader>
				<CardContent>
					{orders.length === 0 ? (
						<p className="text-sm text-muted-foreground py-4 text-center">Nenhuma OF emitida.</p>
					) : (
						<div className="divide-y divide-border/50">
							{orders.map(
								(order: {
									id: string
									number: string | null
									status: string
									sent_at: string | null
									expected_delivery: string | null
									empenho: { numero_empenho: string } | null
									items: { ordered_qty: number }[]
								}) => (
									<div key={order.id} className="flex items-center gap-3 py-2 text-xs">
										<span className="font-mono">{order.number ?? order.id.substring(0, 8)}</span>
										<span className="text-muted-foreground">{order.empenho?.numero_empenho}</span>
										<span className="tabular-nums">{NUM.format(order.items.reduce((acc, item) => acc + Number(item.ordered_qty), 0))}</span>
										<span className="text-muted-foreground">prevista {order.expected_delivery ?? "—"}</span>
										<Badge variant={order.status === "received" ? "secondary" : "outline"} className="text-[10px] ml-auto">
											{STATUS_LABEL[order.status] ?? order.status}
										</Badge>
										{(order.status === "sent" || order.status === "draft") && (
											<Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-destructive" onClick={() => cancel(order.id)}>
												<XCircle className="size-3.5" />
											</Button>
										)}
									</div>
								)
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
