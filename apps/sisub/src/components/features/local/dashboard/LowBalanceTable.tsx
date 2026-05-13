import { Link } from "@tanstack/react-router"
import { CheckCircle2, ChefHat } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { DashboardArpItem } from "@/server/unit-dashboard.fn"
import { ConsumptionBar } from "./ConsumptionBar"

const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })

export function LowBalanceTable({ items, unitIdStr }: { items: DashboardArpItem[]; unitIdStr: string }) {
	if (items.length === 0) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
					<CheckCircle2 className="h-9 w-9 text-green-500" />
					<p className="font-medium text-muted-foreground">Nenhum item com saldo crítico</p>
					<p className="text-sm text-muted-foreground max-w-sm">Todos os itens das ARPs vinculadas às atas publicadas estão com saldo confortável.</p>
				</CardContent>
			</Card>
		)
	}

	return (
		<Card className="overflow-hidden">
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
							<th className="py-2.5 px-3 text-left font-medium">Descrição / CATMAT</th>
							<th className="py-2.5 px-3 text-left font-medium hidden md:table-cell">ARP / ATA</th>
							<th className="py-2.5 px-3 text-right font-medium w-28 hidden sm:table-cell">Qtd Reg.</th>
							<th className="py-2.5 px-3 text-right font-medium w-28 hidden sm:table-cell">Saldo</th>
							<th className="py-2.5 px-3 text-left font-medium w-40">Consumido</th>
							<th className="py-2.5 px-3 text-center font-medium w-28">Cardápio</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border/60">
						{items.map((item) => (
							<tr key={item.id} className={`hover:bg-muted/30 transition-colors ${item.in_upcoming_menu ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}>
								<td className="py-2.5 px-3">
									<p className="font-medium text-sm line-clamp-1">{item.ingredient_name ?? item.descricao_item ?? "—"}</p>
									<p className="text-xs text-muted-foreground font-mono mt-0.5">
										{item.catmat_item_codigo ? `CATMAT ${item.catmat_item_codigo}` : "Sem CATMAT"}
										{item.nome_fornecedor && ` · ${item.nome_fornecedor}`}
									</p>
								</td>
								<td className="py-2.5 px-3 hidden md:table-cell">
									<p className="text-xs font-mono text-foreground">
										{item.arp_numero_ata}/{item.arp_ano_ata ?? "—"}
									</p>
									<Link
										to="/unit/$unitId/procurement/$ataId"
										params={{ unitId: unitIdStr, ataId: item.ata_id }}
										className="text-xs text-muted-foreground hover:text-primary transition-colors line-clamp-1"
									>
										{item.ata_title}
									</Link>
								</td>
								<td className="py-2.5 px-3 text-right text-xs tabular-nums hidden sm:table-cell">
									{item.quantidade_homologada != null ? NUM.format(item.quantidade_homologada) : "—"}
									{item.medida_catmat && <span className="ml-1 text-muted-foreground">{item.medida_catmat}</span>}
								</td>
								<td className="py-2.5 px-3 text-right text-xs tabular-nums hidden sm:table-cell">
									<span
										className={
											(item.saldo_empenho != null ? Number(item.saldo_empenho) : 0) <= 0
												? "text-destructive font-semibold"
												: item.consumption_pct >= 90
													? "text-amber-600 font-semibold"
													: ""
										}
									>
										{item.saldo_empenho != null ? NUM.format(Number(item.saldo_empenho)) : "—"}
									</span>
									{item.medida_catmat && <span className="ml-1 text-muted-foreground">{item.medida_catmat}</span>}
								</td>
								<td className="py-2.5 px-3">
									<ConsumptionBar pct={item.consumption_pct} />
								</td>
								<td className="py-2.5 px-3 text-center">
									{item.in_upcoming_menu ? (
										<Badge variant="outline" className="text-[10px] gap-1 border-amber-400 text-amber-700 dark:text-amber-400">
											<ChefHat className="h-2.5 w-2.5" />
											No cardápio
										</Badge>
									) : (
										<span className="text-xs text-muted-foreground/50">—</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Card>
	)
}
