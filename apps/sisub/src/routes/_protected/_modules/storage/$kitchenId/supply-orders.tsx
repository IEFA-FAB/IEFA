import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Send, XCircle } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { parseMoneyInput } from "@/lib/expense-execution"
import { checkSupplierSicafFn } from "@/server/replenishment.fn"
import { cancelSupplyOrderFn, createSupplyOrderFn, listEmpenhosForKitchenFn, listSupplyOrdersFn } from "@/server/supply-order.fn"

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/supply-orders")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 2),
	loader: async ({ params }) => {
		const kitchenId = Number(params.kitchenId)
		const [orders, empenhos] = await Promise.all([listSupplyOrdersFn({ data: { kitchenId } }), listEmpenhosForKitchenFn({ data: { kitchenId } })])
		return { orders, empenhos }
	},
	component: SupplyOrdersPage,
})

const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

const STATUS_LABEL: Record<string, string> = {
	draft: "Rascunho",
	sent: "Enviada",
	partially_received: "Parcialmente recebida",
	received: "Recebida",
	cancelled: "Cancelada",
	expired: "Expirada",
}

/** O que a NE empenhou, pelos itens: a quantidade do item único, ou o número de itens e o valor. */
function describeEmpenhado(items: readonly EmpenhoItemOption[], valorTotal: number): string {
	const [only] = items
	if (items.length === 1 && only?.quantity != null) return `${NUM.format(only.quantity)} ${only.unit ?? ""} empenhado`.replace(/\s+/g, " ")
	return `${items.length === 1 ? "1 item" : `${items.length} itens`} · ${BRL.format(valorTotal)}`
}

/** Item da NE como `listEmpenhosForKitchenFn` devolve: a OF se monta a partir dele. */
interface EmpenhoItemOption {
	id: string
	arp_item_id: string | null
	purchase_item_id: string | null
	description: string | null
	quantity: number | null
	unit: string | null
	unit_price: number | null
	arp_numero_item: number | null
}

function SupplyOrdersPage() {
	const { orders, empenhos } = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	const router = useRouter()
	const [busy, setBusy] = useState(false)
	const [empenhoId, setEmpenhoId] = useState("")
	const [neItemId, setNeItemId] = useState("")
	const [priceInput, setPriceInput] = useState("")
	const [qty, setQty] = useState("")
	const [expected, setExpected] = useState("")
	const [number, setNumber] = useState("")
	const [sicafCnpj, setSicafCnpj] = useState("")
	const [sicaf, setSicaf] = useState<{ status: string; detail: string } | null>(null)
	const [sicafAck, setSicafAck] = useState(false)

	async function checkSicaf() {
		const cnpj = sicafCnpj.replace(/\D/g, "")
		if (cnpj.length !== 14) {
			toast.error("Informe um CNPJ com 14 dígitos")
			return
		}
		setBusy(true)
		try {
			setSicaf(await checkSupplierSicafFn({ data: { cnpj } }))
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha na consulta SICAF")
		} finally {
			setBusy(false)
		}
	}

	async function emit(e: React.SyntheticEvent) {
		e.preventDefault()
		if (!empenhoId || !qty || !expected) return
		// SICAF é vinculado ao fornecedor do empenho: com CNPJ conhecido, a
		// consulta é obrigatória antes de emitir (review: resultado ausente passava
		// e um resultado antigo sobrevivia à troca de empenho — agora zera na troca)
		if (sicafCnpj.replace(/\D/g, "").length === 14 && sicaf == null) {
			toast.error("Consulte a situação do fornecedor no SICAF antes de emitir a OF")
			return
		}
		if (sicaf != null && sicaf.status !== "regular" && !sicafAck) {
			toast.error("Fornecedor com pendência/indeterminado no SICAF — confirme explicitamente para prosseguir")
			return
		}
		// O item da OF é um item da NE: com a ARP e o preço DELE. Numa NE com vários itens, o
		// cabeçalho não tem item de ARP nem preço, e o teto somaria quantidades de unidades diferentes.
		const neItem = selectedItems.find((item) => item.id === neItemId)
		if (!neItem) {
			toast.error("Escolha o item da NE que esta OF pede")
			return
		}
		const typedPrice = parseMoneyInput(priceInput)
		if (neItem.unit_price == null && !typedPrice.ok) {
			toast.error(`Preço inválido: ${typedPrice.reason}`)
			return
		}
		const unitPrice = neItem.unit_price ?? (typedPrice.ok ? typedPrice.value : null)
		if (unitPrice == null) {
			toast.error("Informe o preço unitário: a NE é conferida pelo valor")
			return
		}
		setBusy(true)
		try {
			await createSupplyOrderFn({
				data: {
					empenhoId,
					kitchenId: Number(kitchenId),
					number: number || undefined,
					expectedDelivery: expected,
					items: [
						{
							arpItemId: neItem.arp_item_id ?? undefined,
							purchaseItemId: neItem.purchase_item_id ?? undefined,
							orderedQty: Number(qty),
							unitPrice,
						},
					],
					sicafStatus: sicaf ? `${sicaf.status}: ${sicaf.detail}` : undefined,
					sicafAcknowledged: sicafAck,
				},
			})
			toast.success("OF emitida")
			setEmpenhoId("")
			setNeItemId("")
			setPriceInput("")
			setQty("")
			setNumber("")
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao emitir OF")
		} finally {
			setBusy(false)
		}
	}

	const selectedEmpenho = empenhos.find((emp: { id: string }) => emp.id === empenhoId) as { items?: EmpenhoItemOption[] } | undefined
	const selectedItems: EmpenhoItemOption[] = selectedEmpenho?.items ?? []
	const selectedItem = selectedItems.find((item) => item.id === neItemId)

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
								{empenhos.map((emp: { id: string; numero_empenho: string; valor_total: number; supplier_cnpj: string | null; items: EmpenhoItemOption[] }) => (
									<button
										key={emp.id}
										type="button"
										onClick={() => {
											setEmpenhoId(emp.id)
											setNeItemId(emp.items.length === 1 ? (emp.items[0]?.id ?? "") : "")
											setPriceInput("")
											setSicafCnpj(emp.supplier_cnpj ?? "")
											setSicaf(null)
											setSicafAck(false)
										}}
										className={`w-full text-left text-xs px-2 py-1 rounded ${empenhoId === emp.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
									>
										<span className="font-mono">{emp.numero_empenho}</span>
										<span className="text-muted-foreground ml-2">{describeEmpenhado(emp.items, Number(emp.valor_total))}</span>
									</button>
								))}
							</div>
						</div>
						{selectedItems.length > 1 && (
							<div className="space-y-1 sm:col-span-5">
								<Label className="text-xs">Item da NE *</Label>
								<div className="max-h-32 overflow-y-auto rounded-md border p-1 space-y-0.5">
									{selectedItems.map((item) => (
										<button
											key={item.id}
											type="button"
											onClick={() => {
												setNeItemId(item.id)
												setPriceInput("")
											}}
											className={`w-full text-left text-xs px-2 py-1 rounded ${neItemId === item.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
										>
											{item.arp_numero_item != null && <span className="font-mono">item {item.arp_numero_item} · </span>}
											{item.description ?? "Item sem descrição"}
											<span className="text-muted-foreground ml-2">
												{item.quantity != null ? `${NUM.format(item.quantity)} ${item.unit ?? ""}` : "por valor"}
												{item.unit_price != null ? ` · R$ ${NUM.format(item.unit_price)}` : ""}
											</span>
										</button>
									))}
								</div>
							</div>
						)}
						{selectedItem != null && selectedItem.unit_price == null && (
							<div className="space-y-1">
								<Label className="text-xs">Preço unitário (R$) *</Label>
								<Input inputMode="decimal" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="0,00" />
							</div>
						)}
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
						<Button type="submit" size="sm" className="gap-1.5" disabled={busy || !empenhoId || !neItemId}>
							{busy ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />}
							Emitir
						</Button>
						<div className="sm:col-span-5 rounded-md bg-muted/40 p-2.5 space-y-1.5">
							<div className="flex items-center gap-2">
								<Label className="text-xs shrink-0">SICAF (fornecedor)</Label>
								<Input
									className="h-7 text-xs w-44 font-mono"
									placeholder="CNPJ (14 dígitos)"
									value={sicafCnpj}
									onChange={(e) => setSicafCnpj(e.target.value)}
								/>
								<Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={checkSicaf}>
									Consultar
								</Button>
								{sicaf && (
									<Badge variant={sicaf.status === "regular" ? "secondary" : "destructive"} className="text-[10px]">
										{sicaf.status}: {sicaf.detail}
									</Badge>
								)}
							</div>
							{sicaf != null && sicaf.status !== "regular" && (
								<label className="flex items-center gap-2 text-xs text-warning">
									<input type="checkbox" checked={sicafAck} onChange={(e) => setSicafAck(e.target.checked)} />
									Ciente da pendência no SICAF — decido prosseguir (registrado com meu usuário na OF)
								</label>
							)}
						</div>
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
											<Tooltip>
												<TooltipTrigger
													render={
														<Button
															size="sm"
															variant="ghost"
															className="h-6 text-xs px-2 text-destructive"
															onClick={() => cancel(order.id)}
															aria-label="Cancelar ordem"
														>
															<XCircle className="size-3.5" />
														</Button>
													}
												/>
												<TooltipContent>Cancelar ordem</TooltipContent>
											</Tooltip>
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
