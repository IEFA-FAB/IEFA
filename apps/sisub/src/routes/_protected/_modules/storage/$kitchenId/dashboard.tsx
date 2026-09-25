import { STOCK_MOVEMENT_LABELS, type StockMovementType } from "@iefa/sisub-domain"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ChevronDown, ChevronRight, PackageOpen, Printer, Scissors, ShieldAlert, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { LotLabelSheet } from "@/components/features/storage/lots/LotLabel"
import { SplitLotDialog } from "@/components/features/storage/lots/SplitLotDialog"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchExpirySummaryFn } from "@/server/expiry.fn"
import { fetchStockBalanceFn, fetchStockMovementsFn, type StockBalanceItem } from "@/server/stock.fn"

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/dashboard")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loader: async ({ params }) => {
		const kitchenId = Number(params.kitchenId)
		const [balance, movements, expiry] = await Promise.all([
			fetchStockBalanceFn({ data: { kitchenId } }),
			fetchStockMovementsFn({ data: { kitchenId, limit: 20 } }),
			fetchExpirySummaryFn({ data: { kitchenId } }),
		])
		return { balance, movements, expiry, kitchenId }
	},
	component: StockDashboardPage,
})

const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function daysUntil(iso: string): number {
	return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

type LotRow = StockBalanceItem["lots"][number]

function BalanceRow({
	item,
	onPrint,
	onSplit,
}: {
	item: StockBalanceItem
	onPrint: (lot: LotRow, item: StockBalanceItem) => void
	onSplit: (lot: LotRow, item: StockBalanceItem) => void
}) {
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
									<div key={lot.lot_id ?? "none"} className="flex flex-wrap items-center gap-3 py-0.5 text-xs">
										<code className="rounded bg-muted px-1.5">{lot.lot_code ?? "sem lote"}</code>
										{lot.short_code && <code className="text-muted-foreground">{lot.short_code}</code>}
										<span className="tabular-nums">{NUM.format(lot.balance)}</span>
										<span className="text-muted-foreground">{lot.expiry_date ? `val ${lot.expiry_date}` : "sem validade"}</span>
										{lot.location && <span className="text-muted-foreground">{lot.location}</span>}
										{lot.derivation && (
											<Badge variant="outline" className="text-[10px]">
												{{ opened: "aberto", portioned: "fracionado", thawed: "descongelado" }[lot.derivation] ?? lot.derivation}
											</Badge>
										)}
										{lot.quarantined && (
											<Badge variant="outline" className="text-[10px] text-warning">
												<ShieldAlert className="mr-1 size-3" />
												em quarentena — fora da alocação
											</Badge>
										)}
										{lot.lot_id != null && lot.short_code != null && !lot.quarantined && (
											<span className="flex gap-1">
												<Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => onPrint(lot, item)}>
													<Printer className="mr-1 size-3" />
													Etiqueta
												</Button>
												<Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => onSplit(lot, item)}>
													<Scissors className="mr-1 size-3" />
													Fracionar
												</Button>
											</span>
										)}
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
	const { balance, movements, expiry, kitchenId } = Route.useLoaderData()
	// Etiqueta e fracionamento moram aqui porque é aqui que o operador vê o lote.
	// Pedir para ele ir a outra tela para imprimir a etiqueta do lote que acabou
	// de receber é o caminho para ninguém etiquetar nada.
	const [label, setLabel] = useState<React.ComponentProps<typeof LotLabelSheet>["lots"][number] | null>(null)
	const [splitting, setSplitting] = useState<React.ComponentProps<typeof SplitLotDialog>["lot"] | null>(null)
	const totalValue = balance.reduce((acc, i) => acc + i.balanceValue, 0)

	return (
		<div className="space-y-6">
			{label && (
				<Card className="print:border-0 print:shadow-none">
					<CardHeader className="pb-2 print:hidden">
						<CardTitle className="text-subheading">Etiqueta do lote</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<LotLabelSheet lots={[label]} width="58mm" />
						<div className="flex gap-2 print:hidden">
							<Button type="button" onClick={() => window.print()}>
								<Printer className="mr-2 size-4" />
								Imprimir
							</Button>
							<Button type="button" variant="ghost" onClick={() => setLabel(null)}>
								Fechar
							</Button>
						</div>
					</CardContent>
				</Card>
			)}
			{splitting && <SplitLotDialog lot={splitting} onClose={() => setSplitting(null)} />}
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
				{/*
				 * Antes este bloco contava "vencendo em 30 dias" no cliente, com 30
				 * fixo para TUDO. Trinta dias é folga demais para o feijão e tarde
				 * demais para o leite pasteurizado: o cartão ficava permanentemente
				 * aceso por causa do seco e calado sobre o resfriado, que é o que de
				 * fato estraga. Agora o número vem do limite da cozinha, item a item.
				 */}
				<Card>
					<CardContent className="pt-4">
						<p className="text-label text-muted-foreground">Vencido + crítico</p>
						<p className={`text-heading tabular-nums ${expiry.urgentLots > 0 ? "text-warning" : ""}`}>{expiry.urgentLots}</p>
						<p className="text-xs text-muted-foreground">
							{BRL.format(expiry.valueAtRisk)} em risco
							{expiry.noExpiryLots > 0 && ` · ${expiry.noExpiryLots} perecível(is) sem validade`}
						</p>
						<Link to="/storage/$kitchenId/expiry" params={{ kitchenId: String(kitchenId) }} className="mt-1 inline-block text-xs text-primary underline">
							Ver vencimentos
						</Link>
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
									<BalanceRow
										key={item.ingredientId ?? item.frozenPreparationId ?? item.description}
										item={item}
										onPrint={(lot, row) =>
											setLabel({
												shortCode: lot.short_code as string,
												description: row.description,
												lotCode: lot.lot_code,
												expiryDate: lot.expiry_date,
												location: lot.location,
												derivation: lot.derivation as "opened" | "portioned" | "thawed" | null,
												quantity: lot.balance,
												measureUnit: row.measureUnit,
											})
										}
										onSplit={(lot, row) =>
											setSplitting({
												id: lot.lot_id as string,
												description: row.description,
												lotCode: lot.lot_code,
												balance: lot.balance,
												measureUnit: row.measureUnit,
												location: lot.location,
											})
										}
									/>
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
									<span className="text-muted-foreground w-32 shrink-0">{STOCK_MOVEMENT_LABELS[m.type as StockMovementType] ?? String(m.type)}</span>
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
