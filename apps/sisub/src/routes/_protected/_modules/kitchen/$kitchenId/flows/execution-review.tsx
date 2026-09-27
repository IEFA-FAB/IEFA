import { createFileRoute, useParams } from "@tanstack/react-router"
import { CheckCircle2, Loader2 } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { FlowView } from "@/components/features/flows/FlowView"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { useExecutionReviewStatus, useReviewExecutionMenuItem } from "@/hooks/data/useProcurementFlows"
import { buildExecutionReviewSteps } from "@/lib/flows/execution-review"
import { formatShortDate } from "@/lib/flows/model"

/**
 * GESTÃO COZINHA — Fluxo "Revisar a execução"
 * URL: /kitchen/:kitchenId/flows/execution-review
 *
 * O turno não espera o planejamento: inclui preparação no dia, cria provisória, registra o que
 * faltou. Aqui a nutricionista vê o que ficou para ela e marca como revisado.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/flows/execution-review")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: ExecutionReviewFlowPage,
	head: () => ({ meta: [{ name: "description", content: "Fluxo guiado da revisão do que o turno resolveu no dia" }] }),
})

function ExecutionReviewFlowPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const { data, isLoading, isError } = useExecutionReviewStatus(kitchenId)
	const { mutate: review, isPending, variables } = useReviewExecutionMenuItem(kitchenId)
	const href = `/kitchen/${kitchenId}/flows/execution-review`

	return (
		<div className="space-y-6">
			<PageHeader
				title="Revisar a execução"
				description="O que o turno resolveu no dia sem esperar o planejamento: preparações incluídas, fichas provisórias e incompletas. Nada disso travou o dia; aqui é onde se corrige."
			/>
			{isLoading ? (
				<div className="h-64 animate-pulse rounded-xl border bg-muted" aria-hidden="true" />
			) : isError || !data ? (
				<p className="text-sm text-destructive">Não foi possível ler as pendências da execução.</p>
			) : (
				<>
					<FlowView steps={buildExecutionReviewSteps(data)} origin={{ href, label: "Revisar a execução" }} />
					{data.addedItems.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle>Inclusões do turno para revisar</CardTitle>
								<CardDescription>
									Confira se a preparação e as porções fazem sentido. Ajustes de cardápio e de ficha são feitos nas telas de sempre.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<ItemGroup>
									{data.addedItems.map((item) => (
										<Item key={item.menuItemId} variant="outline" size="sm">
											<ItemContent>
												<ItemTitle>
													{item.recipeName}
													{item.provisional && <Badge variant="warning">provisória</Badge>}
												</ItemTitle>
												<ItemDescription>
													{formatShortDate(`${item.serviceDate}T12:00:00-03:00`)}
													{item.mealTypeName ? ` · ${item.mealTypeName}` : ""} · {item.reason}
													{item.addedBy ? ` · incluída por ${item.addedBy}` : ""}
												</ItemDescription>
											</ItemContent>
											<ItemActions>
												<Button size="sm" variant="outline" disabled={isPending} onClick={() => review(item.menuItemId)}>
													{isPending && variables === item.menuItemId ? (
														<Loader2 className="size-4 animate-spin" aria-hidden="true" />
													) : (
														<CheckCircle2 className="size-4" aria-hidden="true" />
													)}
													Marcar revisada
												</Button>
											</ItemActions>
										</Item>
									))}
								</ItemGroup>
							</CardContent>
						</Card>
					)}
				</>
			)}
		</div>
	)
}
