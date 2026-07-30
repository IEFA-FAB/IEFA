import { createFileRoute } from "@tanstack/react-router"
import { ShoppingBasket, TriangleAlert } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fetchReplenishmentSuggestionsFn, type ReplenishmentSuggestion } from "@/server/replenishment.fn"

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/replenishment")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loader: ({ params }) => fetchReplenishmentSuggestionsFn({ data: { kitchenId: Number(params.kitchenId), horizonDays: 14 } }),
	component: ReplenishmentPage,
	head: () => ({
		meta: [{ title: "Estoque — Sugestões de Reposição" }],
	}),
})

const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })

const CHANNEL_META: Record<string, { label: string; className: string }> = {
	own_arp: { label: "Empenho na ARP própria", className: "bg-success/10 text-success" },
	carona: { label: "Carona (adesão)", className: "bg-primary/10 text-primary" },
	supermercado_virtual: { label: "Supermercado Virtual", className: "bg-warning/10 text-warning" },
	contrata_mais: { label: "Contrata+Brasil", className: "bg-primary/10 text-primary" },
	licitacao: { label: "Nova licitação", className: "bg-muted text-muted-foreground" },
}

function ReplenishmentPage() {
	const suggestions = Route.useLoaderData()

	return (
		<div className="space-y-6">
			<PageHeader
				title="Sugestões de Reposição"
				description="Necessidade líquida do horizonte de 14 dias (demanda × FC ÷ IR − estoque válido − trânsito) com canal de compra recomendado. A decisão final é sua — o sistema só recomenda."
			/>

			<Card>
				<CardContent className="px-0 pb-0 pt-2">
					{suggestions.length === 0 ? (
						<div className="text-center py-10 text-muted-foreground">
							<ShoppingBasket className="size-8 mx-auto mb-2 opacity-50" />
							<p className="text-sm">Nenhuma necessidade líquida no horizonte — estoque e trânsito cobrem a demanda planejada.</p>
						</div>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
									<th className="py-2 px-3 text-left text-label">Ingrediente</th>
									<th className="py-2 px-2 text-right text-label w-28">Demanda bruta</th>
									<th className="py-2 px-2 text-right text-label w-24">Estoque</th>
									<th className="py-2 px-2 text-right text-label w-24">Trânsito</th>
									<th className="py-2 px-2 text-right text-label w-28">Necessidade</th>
									<th className="py-2 px-2 text-right text-label w-24">Lead time</th>
									<th className="py-2 px-2 text-left text-label w-52">Canal recomendado</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{suggestions.map((row: ReplenishmentSuggestion) => {
									const meta = CHANNEL_META[row.channel] ?? CHANNEL_META.licitacao
									return (
										<tr key={row.ingredientId}>
											<td className="py-2 px-3 text-xs">
												{row.description}
												{row.expiringExcluded > 0 && (
													<Tooltip>
														<TooltipTrigger className="ml-1.5 align-middle">
															<TriangleAlert className="size-3.5 text-warning inline" />
														</TooltipTrigger>
														<TooltipContent>
															{NUM.format(row.expiringExcluded)} em lotes vencendo no horizonte — excluídos do disponível; priorizar consumo
														</TooltipContent>
													</Tooltip>
												)}
											</td>
											<td className="py-2 px-2 text-xs text-right tabular-nums">
												<Tooltip>
													<TooltipTrigger className="cursor-help underline decoration-dotted">{NUM.format(row.grossDemand)}</TooltipTrigger>
													<TooltipContent className="max-w-sm font-mono text-[11px]">{row.calcMemory}</TooltipContent>
												</Tooltip>
											</td>
											<td className="py-2 px-2 text-xs text-right tabular-nums">{NUM.format(row.availableStock)}</td>
											<td className="py-2 px-2 text-xs text-right tabular-nums">{NUM.format(row.inTransit)}</td>
											<td className="py-2 px-2 text-xs text-right tabular-nums text-subheading">
												{NUM.format(row.netNeed)}
												{row.measureUnit && <span className="ml-1 text-muted-foreground font-normal">{row.measureUnit}</span>}
											</td>
											<td className="py-2 px-2 text-xs text-right">
												{row.leadTime.days}d
												<span className="block text-[10px] text-muted-foreground">
													{row.leadTime.source === "observed" ? "observado" : row.leadTime.source === "arp_default" ? "prazo ARP" : "default"}
												</span>
											</td>
											<td className="py-2 px-2">
												<Tooltip>
													<TooltipTrigger>
														<Badge className={`text-[10px] ${meta?.className}`}>{meta?.label}</Badge>
													</TooltipTrigger>
													<TooltipContent className="max-w-sm">{row.reason}</TooltipContent>
												</Tooltip>
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
