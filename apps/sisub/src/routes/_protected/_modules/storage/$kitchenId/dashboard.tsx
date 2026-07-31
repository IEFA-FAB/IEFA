import { createFileRoute } from "@tanstack/react-router"
import { ChevronDown, ChevronRight, PackageOpen, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchStockBalanceFn, fetchStockMovementsFn, type StockBalanceItem } from "@/server/stock.fn"

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/dashboard")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loader: async ({ params }) => {
		const kitchenId = Number(params.kitchenId)
		const [balance, movements] = await Promise.all([fetchStockBalanceFn({ data: { kitchenId } }), fetchStockMovementsFn({ data: { kitchenId, limit: 20 } })])
		return { balance, movements }
	},
	component: StockDashboardPage,
	head: () => ({
		meta: [{ title: "Estoque — Painel" }],
	}),
})

const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

const MOVEMENT_LABEL: Record<string, string> = {
	receipt: "Entrada (recebimento)",
	production_issue: "Saída (produção)",
	leftover_return: "Retorno de sobra",
	waste: "Descarte",
	transfer_in: "Transferência (entrada)",
	transfer_out: "Transferência (saída)",
	adjustment_in: "Ajuste (entrada)",
	adjustment_out: "Ajuste (saída)",
}

function daysUntil(iso: string): number {
	return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

function BalanceRow({ item }: { item: StockBalanceItem }) {
	const [expanded, setExpanded] = useState(false)
	const expiring = item.nextExpiry != null && daysUntil(item.nextExpiry) <= 30

	return (
		<>
			<tr className="cursor-pointer hover:bg-muted/40" onClick={() => setExpanded((v) => !v)}>
				<td className="py-2 px-3 w-6">
					{expanded ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
				</td>
				<td className="py-2 px-2 text-xs">
					{item.description}
					{item.frozenPreparationId && (
						<Badge variant="outline" className="ml-2 text-[10px]">
							Preparação
						</Badge>
					)}
				</td>
				<td className="py-2 px-2 text-xs text-right tabular-nums">
					{NUM.format(item.balance)}
					{item.measureUnit && <span className="ml-1 text-muted-foreground">{item.measureUnit}</span>}
				</td>
				<td className="py-2 px-2 text-xs text-right tabular-nums">{BRL.format(item.balanceValue)}</td>
				<td className="py-2 px-2 text-xs text-right">
					{item.nextExpiry ? (
						<span suppressHydrationWarning className={expiring ? "text-warning inline-flex items-center gap-1" : ""}>
							{expiring && <TriangleAlert className="size-3.5" />}
							{item.nextExpiry}
						</span>
					) : (
						"—"
					)}
				</td>
			</tr>
			{expanded && (
				<tr>
					<td colSpan={5} className="bg-muted/20 px-3 pb-2">
						<div className="ml-6 pt-1 space-y-0.5">
							{item.lots
								.filter((lot) => lot.balance !== 0)
								.map((lot) => (
									<div key={lot.lot_id ?? "none"} className="flex items-center gap-3 text-xs py-0.5">
										<code className="bg-muted px-1.5 rounded">{lot.lot_code ?? "sem lote"}</code>
										<span className="tabular-nums">{NUM.format(lot.balance)}</span>
										<span className="text-muted-foreground">{lot.expiry_date ? `val ${lot.expiry_date}` : "sem validade"}</span>
									</div>
								))}
						</div>
					</td>
				</tr>
			)}
		</>
	)
}

function StockDashboardPage() {
	const { balance, movements } = Route.useLoaderData()
	const expiringCount = balance.filter((i) => i.nextExpiry != null && daysUntil(i.nextExpiry) <= 30).length
	const totalValue = balance.reduce((acc, i) => acc + i.balanceValue, 0)

	return (
		<div className="space-y-6">
			<PageHeader title="Painel de Estoque" description="Saldo por item e lote (FEFO), valorado a custo médio ponderado (MCASP)." />

			<div className="grid gap-4 sm:grid-cols-3">
				<Card>
					<CardContent className="pt-4">
						<p className="text-label text-muted-foreground">Itens em estoque</p>
						<p className="text-heading tabular-nums">{balance.filter((i) => i.balance > 0).length}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<p className="text-label text-muted-foreground">Valor total</p>
						<p className="text-heading tabular-nums">{BRL.format(totalValue)}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<p className="text-label text-muted-foreground">Vencendo em 30 dias</p>
						<p suppressHydrationWarning className={`text-heading tabular-nums ${expiringCount > 0 ? "text-warning" : ""}`}>
							{expiringCount}
						</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Saldo por item</CardTitle>
				</CardHeader>
				<CardContent className="px-0 pb-0">
					{balance.length === 0 ? (
						<div className="text-center py-10 text-muted-foreground">
							<PackageOpen className="size-8 mx-auto mb-2 opacity-50" />
							<p className="text-sm">Sem movimentos ainda — o estoque nasce do recebimento de NF-e.</p>
						</div>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
									<th className="py-2 px-3 w-6" />
									<th className="py-2 px-2 text-left text-label">Item</th>
									<th className="py-2 px-2 text-right text-label w-32">Saldo</th>
									<th className="py-2 px-2 text-right text-label w-32">Valor</th>
									<th className="py-2 px-2 text-right text-label w-36">Próx. validade</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{balance.map((item) => (
									<BalanceRow key={item.ingredientId ?? item.frozenPreparationId ?? item.description} item={item} />
								))}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Movimentos recentes</CardTitle>
				</CardHeader>
				<CardContent>
					{movements.length === 0 ? (
						<p className="text-sm text-muted-foreground py-4 text-center">Nenhum movimento registrado.</p>
					) : (
						<div className="divide-y divide-border/50">
							{movements.map((m: Record<string, unknown>) => (
								<div key={String(m.id)} className="flex items-center gap-3 py-1.5 text-xs">
									<span className="text-muted-foreground w-32 shrink-0">{MOVEMENT_LABEL[String(m.type)] ?? String(m.type)}</span>
									<span className="truncate">{String(m.description)}</span>
									<span className="ml-auto tabular-nums shrink-0">{NUM.format(Number(m.quantity))}</span>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
