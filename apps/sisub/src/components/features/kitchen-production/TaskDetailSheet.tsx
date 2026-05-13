import { CheckCircle2, ChefHat, Clock, PlayCircle, RotateCcw, Timer, Utensils } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ProductionItem, ProductionTaskStatus } from "@/types/domain/production"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusLabel(status: ProductionTaskStatus) {
	if (status === "PENDING") return "Pendente"
	if (status === "IN_PROGRESS") return "Em Preparo"
	return "Pronto"
}

function statusVariant(status: ProductionTaskStatus): "outline" | "warning" | "success" {
	if (status === "PENDING") return "outline"
	if (status === "IN_PROGRESS") return "warning"
	return "success"
}

/**
 * Escala a quantidade líquida de um ingrediente para as porções planejadas.
 * Fórmula: net_quantity × (planned_portions / portion_yield)
 */
function scaleIngredientQty(netQty: number | null, plannedPortions: number | null | undefined, portionYield: number | null | undefined): string {
	if (netQty == null) return "—"
	if (!plannedPortions || !portionYield || portionYield === 0) {
		return formatQty(netQty)
	}
	const scaled = netQty * (plannedPortions / portionYield)
	return formatQty(scaled)
}

function formatQty(value: number): string {
	return value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TaskDetailSheetProps {
	item: ProductionItem | null
	open: boolean
	onOpenChange: (open: boolean) => void
	onUpdateStatus: (taskId: string, status: ProductionTaskStatus) => void
	isUpdating?: boolean
}

export function TaskDetailSheet({ item, open, onOpenChange, onUpdateStatus, isUpdating = false }: TaskDetailSheetProps) {
	if (!item) return null

	const { task, menuItem, mealType } = item
	const recipe = menuItem.recipe_with_ingredients
	const portionYield = recipe?.portion_yield ?? null
	const plannedPortions = menuItem.planned_portion_quantity ?? null

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="sm:max-w-lg w-full flex flex-col overflow-y-auto gap-0">
				<SheetHeader className="border-b border-border">
					<div className="flex flex-wrap items-center gap-2 mb-1">
						{mealType?.name && (
							<Badge variant="secondary" className="text-xs">
								{mealType.name}
							</Badge>
						)}
						<Badge variant={statusVariant(task.status)} className="text-xs">
							{statusLabel(task.status)}
						</Badge>
					</div>
					<SheetTitle className="text-lg leading-snug">{recipe?.name ?? menuItem.recipe_origin?.name ?? "Preparação"}</SheetTitle>
					{(plannedPortions || recipe?.preparation_time_minutes) && (
						<SheetDescription className="flex flex-wrap items-center gap-3 mt-1">
							{plannedPortions && (
								<span className="flex items-center gap-1">
									<Utensils className="h-3.5 w-3.5" />
									{plannedPortions} porções planejadas
								</span>
							)}
							{recipe?.preparation_time_minutes && (
								<span className="flex items-center gap-1">
									<Timer className="h-3.5 w-3.5" />
									{recipe.preparation_time_minutes} min
								</span>
							)}
							{portionYield && (
								<span className="flex items-center gap-1 text-muted-foreground">
									<ChefHat className="h-3.5 w-3.5" />
									rendimento base: {portionYield} porções
								</span>
							)}
						</SheetDescription>
					)}
				</SheetHeader>

				{/* Ingredientes */}
				<div className="flex-1 overflow-y-auto">
					{recipe?.ingredients && recipe.ingredients.length > 0 ? (
						<div className="p-4 space-y-2">
							<h3 className="text-sm font-medium text-foreground flex items-center gap-2">
								<Utensils className="h-4 w-4 text-muted-foreground" />
								Ingredientes
								{plannedPortions && portionYield && (
									<span className="text-xs text-muted-foreground font-normal">(quantidades para {plannedPortions} porções)</span>
								)}
							</h3>
							<div className="rounded-md border border-border overflow-hidden">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Ingrediente</TableHead>
											<TableHead className="text-right w-28">Quantidade</TableHead>
											<TableHead className="w-16">Un.</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{[...recipe.ingredients]
											.sort((a, b) => (a.priority_order ?? 0) - (b.priority_order ?? 0))
											.map((ingredient) => (
												<TableRow key={ingredient.id} className={ingredient.is_optional ? "opacity-60" : undefined}>
													<TableCell className="font-medium">
														{ingredient.ingredient?.description ?? "—"}
														{ingredient.is_optional && <span className="ml-1.5 text-xs text-muted-foreground">(opcional)</span>}
													</TableCell>
													<TableCell className="text-right tabular-nums">
														{scaleIngredientQty(ingredient.net_quantity, plannedPortions, portionYield)}
													</TableCell>
													<TableCell className="text-muted-foreground text-xs">{ingredient.ingredient?.measure_unit ?? "—"}</TableCell>
												</TableRow>
											))}
									</TableBody>
								</Table>
							</div>
						</div>
					) : (
						<div className="p-4 text-sm text-muted-foreground italic">Nenhum ingrediente cadastrado para esta receita.</div>
					)}

					{/* Modo de Preparo */}
					{recipe?.preparation_method && (
						<div className="px-4 pb-4 space-y-2">
							<h3 className="text-sm font-medium text-foreground flex items-center gap-2">
								<Clock className="h-4 w-4 text-muted-foreground" />
								Modo de Preparo
							</h3>
							<div className="rounded-md border border-border bg-muted/30 p-3">
								<pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{recipe.preparation_method}</pre>
							</div>
						</div>
					)}

					{/* Timestamps */}
					{(task.started_at || task.completed_at) && (
						<div className="px-4 pb-4 space-y-1 text-xs text-muted-foreground">
							{task.started_at && (
								<p>
									Iniciado em:{" "}
									{new Date(task.started_at).toLocaleTimeString("pt-BR", {
										hour: "2-digit",
										minute: "2-digit",
									})}
								</p>
							)}
							{task.completed_at && (
								<p>
									Concluído em:{" "}
									{new Date(task.completed_at).toLocaleTimeString("pt-BR", {
										hour: "2-digit",
										minute: "2-digit",
									})}
								</p>
							)}
						</div>
					)}
				</div>

				{/* Footer com ações */}
				<SheetFooter className="border-t border-border">
					{task.status === "PENDING" && (
						<Button className="w-full" onClick={() => onUpdateStatus(task.id, "IN_PROGRESS")} disabled={isUpdating}>
							<PlayCircle className="h-4 w-4" />
							Iniciar Preparo
						</Button>
					)}
					{task.status === "IN_PROGRESS" && (
						<>
							<Button variant="success" className="flex-1" onClick={() => onUpdateStatus(task.id, "DONE")} disabled={isUpdating}>
								<CheckCircle2 className="h-4 w-4" />
								Marcar como Pronto
							</Button>
							<Button variant="ghost" onClick={() => onUpdateStatus(task.id, "PENDING")} disabled={isUpdating}>
								<RotateCcw className="h-4 w-4" />
								Desfazer
							</Button>
						</>
					)}
					{task.status === "DONE" && (
						<Button variant="outline" className="w-full" onClick={() => onUpdateStatus(task.id, "PENDING")} disabled={isUpdating}>
							<RotateCcw className="h-4 w-4" />
							Reabrir Preparo
						</Button>
					)}
				</SheetFooter>
			</SheetContent>
		</Sheet>
	)
}
