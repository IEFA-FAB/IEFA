import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { FileText, Plus, Send, ShoppingCart } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useDeleteDemandForecast, useDemandForecasts, useSendDemandForecast } from "@/hooks/data/useDemandForecast"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/demand-forecasts/")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: DemandForecastsPage,
	head: () => ({
		meta: [{ name: "description", content: "Monte e envie à unidade a previsão de demanda que alimenta o anexo quantitativo do TR" }],
	}),
})

const STATUS_LABELS: Record<string, string> = {
	pending: "Em elaboração",
	sent: "Enviada à unidade",
	reviewed: "Recebida pela unidade",
}

const STATUS_VARIANTS: Record<string, "secondary" | "default" | "outline"> = {
	pending: "secondary",
	sent: "default",
	reviewed: "outline",
}

function DemandForecastsPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)

	const { data: forecasts, isLoading } = useDemandForecasts(kitchenId)
	const { mutate: sendForecast, isPending: isSending } = useSendDemandForecast()
	const { mutate: deleteForecast, isPending: isDeleting } = useDeleteDemandForecast()

	const handleSend = (forecastId: string, title: string) => {
		if (window.confirm(`Enviar a previsão "${title}" à unidade?`)) {
			sendForecast(forecastId)
		}
	}

	const handleDelete = (forecastId: string, title: string) => {
		if (window.confirm(`Remover a previsão "${title}"?`)) {
			deleteForecast(forecastId)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Previsão de demanda"
				description="Diga à unidade quais cardápios semanais, eventos e cardápios de apoio a cozinha vai produzir, e quantas vezes: é a base do quantitativo de compra."
			>
				<Button
					size="sm"
					nativeButton={false}
					render={
						<Link to="/kitchen/$kitchenId/demand-forecasts/new" params={{ kitchenId: kitchenIdStr as string }}>
							<Plus className="size-4 mr-2" />
							Nova previsão
						</Link>
					}
				/>
			</PageHeader>

			{isLoading ? (
				<div className="space-y-3">
					{[1, 2].map((i) => (
						<div key={i} className="h-24 animate-pulse rounded-md border bg-muted" aria-hidden="true" />
					))}
				</div>
			) : !forecasts || forecasts.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-14 text-center">
						<ShoppingCart className="size-12 text-muted-foreground mb-4" aria-hidden="true" />
						<p className="text-subheading text-muted-foreground">Nenhuma previsão criada ainda.</p>
						<p className="text-sm text-muted-foreground mt-1">
							Monte a previsão com os cardápios que a cozinha vai produzir; a unidade usa ela no anexo quantitativo do TR.
						</p>
						<Button
							variant="outline"
							size="sm"
							className="mt-4"
							nativeButton={false}
							render={
								<Link to="/kitchen/$kitchenId/demand-forecasts/new" params={{ kitchenId: kitchenIdStr as string }}>
									<Plus className="size-4 mr-2" />
									Criar primeira previsão
								</Link>
							}
						/>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-3">
					{forecasts.map((forecast) => (
						<Card key={forecast.id}>
							<CardHeader className="pb-2">
								<div className="flex items-start justify-between gap-2">
									<div className="flex-1 min-w-0">
										<CardTitle className="text-base flex items-center gap-2">
											<FileText className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
											{forecast.title}
										</CardTitle>
										{forecast.notes && <CardDescription className="mt-1 line-clamp-2">{forecast.notes}</CardDescription>}
									</div>
									<Badge variant={STATUS_VARIANTS[forecast.status] || "secondary"}>{STATUS_LABELS[forecast.status] || forecast.status}</Badge>
								</div>
							</CardHeader>
							<CardContent className="pb-3">
								{forecast.status === "reviewed" && (
									<p className="mb-2 text-xs text-success">
										Recebida pela unidade
										{forecast.reviewed_at ? ` em ${new Date(forecast.reviewed_at).toLocaleDateString("pt-BR")}` : ""}
										{forecast.imports?.length
											? ` · no${forecast.imports.length === 1 ? "" : "s"} anexo${forecast.imports.length === 1 ? "" : "s"} ${forecast.imports.map((i) => `"${i.title}"`).join(", ")}`
											: ""}
									</p>
								)}
								<div className="flex items-center justify-between gap-2">
									<p className="text-xs text-muted-foreground">
										{forecast.selections.length} {forecast.selections.length === 1 ? "seleção" : "seleções"}
										{forecast.updated_at
											? ` · Atualizado ${new Date(forecast.updated_at).toLocaleDateString("pt-BR")}`
											: ` · Criado ${new Date(forecast.created_at).toLocaleDateString("pt-BR")}`}
									</p>
									<div className="flex items-center gap-2">
										{forecast.status === "pending" && (
											<>
												<Button
													size="sm"
													variant="outline"
													nativeButton={false}
													render={
														<Link to="/kitchen/$kitchenId/demand-forecasts/$forecastId" params={{ kitchenId: kitchenIdStr as string, forecastId: forecast.id }}>
															Editar
														</Link>
													}
												/>
												<Button size="sm" onClick={() => handleSend(forecast.id, forecast.title)} disabled={isSending || forecast.selections.length === 0}>
													<Send className="size-3.5" aria-hidden="true" />
													Enviar
												</Button>
											</>
										)}
										<Button
											size="sm"
											variant="ghost"
											className="text-destructive hover:text-destructive"
											onClick={() => handleDelete(forecast.id, forecast.title)}
											disabled={isDeleting}
										>
											Remover
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	)
}
