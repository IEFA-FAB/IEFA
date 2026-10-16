import { describeSnapshotGaps } from "@iefa/sisub-domain"
import { AlertTriangle, ArrowLeftRight, CheckCircle2, ChefHat, PlayCircle, RotateCcw, Timer, Utensils } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { SubstitutionEntry } from "@/lib/menu-substitutions"
import type { ProductionItem, ProductionTaskStatus } from "@/types/domain/production"
import { ProductionRecordSection } from "./ProductionRecordSection"
import { RecipeStepsChecklist } from "./RecipeStepsChecklist"
import { ShiftAdjustmentsSection } from "./ShiftAdjustmentsSection"
import { SnackRequestTag } from "./SnackRequestTag"
import { describeTaskSheetFacts, scaleIngredientQty, type TaskSheetFacts } from "./task-detail-sheet"

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TaskDetailSheetProps {
	item: ProductionItem | null
	open: boolean
	onOpenChange: (open: boolean) => void
	onUpdateStatus: (taskId: string, status: ProductionTaskStatus) => void
	kitchenId: number
	date: string
	isUpdating?: boolean
}

export function TaskDetailSheet({ item, open, onOpenChange, onUpdateStatus, kitchenId, date, isUpdating = false }: TaskDetailSheetProps) {
	if (!item) return null

	const { task, menuItem } = item
	const recipe = menuItem.recipe_with_ingredients
	const portionYield = recipe?.portion_yield ?? null
	const plannedPortions = menuItem.planned_portion_quantity ?? null
	// Os mesmos números (só positivos) no cabeçalho, no rótulo "quantidades para N" e na escala.
	const facts = describeTaskSheetFacts({ plannedPortions, preparationMinutes: recipe?.preparation_time_minutes, portionYield })
	const substitutionEntries = Object.entries((menuItem.substitutions as Record<string, SubstitutionEntry> | null) ?? {})

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="sm:max-w-lg w-full flex flex-col overflow-y-auto gap-0">
				<TaskSheetHeader item={item} recipe={recipe} facts={facts} />

				{/* Ingredientes */}
				<div className="flex-1 overflow-y-auto">
					<ExecutionNotices menuItem={menuItem} />
					<IngredientsSection recipe={recipe} facts={facts} />

					{/* Substituições registradas */}
					{substitutionEntries.length > 0 && <SubstitutionsSection substitutionEntries={substitutionEntries} recipe={recipe} />}

					{/* Ajustes do turno (porções + substituição) */}
					<ShiftAdjustmentsSection item={item} kitchenId={kitchenId} date={date} />

					{/* Registro do real (após início do preparo) */}
					{task.status !== "PENDING" && (
						<ProductionRecordSection task={task} plannedPortions={plannedPortions != null ? Number(plannedPortions) : null} kitchenId={kitchenId} date={date} />
					)}

					{/* Pré-preparo + Modo de Preparo: checklist do fluxo estruturado (DAG) ou texto livre */}
					<RecipeStepsChecklist
						recipeId={menuItem.recipe_origin_id}
						fallbackText={recipe?.preparation_method ?? null}
						prePreparationText={recipe?.pre_preparation_method ?? null}
					/>

					{/* Timestamps */}
					<TaskTimestamps task={task} />
				</div>

				{/* Footer com ações */}
				<TaskActions task={task} onUpdateStatus={onUpdateStatus} isUpdating={isUpdating} />
			</SheetContent>
		</Sheet>
	)
}

// ---------------------------------------------------------------------------
// Partes do sheet (apresentação)
// ---------------------------------------------------------------------------

type ProductionMenuItem = ProductionItem["menuItem"]
type ProductionRecipe = ProductionMenuItem["recipe_with_ingredients"]
type ProductionTask = ProductionItem["task"]

function TaskSheetHeader({ item, recipe, facts }: { item: ProductionItem; recipe: ProductionRecipe; facts: TaskSheetFacts }) {
	const { task, menuItem, mealType } = item
	return (
		<SheetHeader className="border-b border-border">
			<div className="flex flex-wrap items-center gap-2 mb-1">
				{mealType?.name && <Badge variant="secondary">{mealType.name}</Badge>}
				<Badge variant={statusVariant(task.status)} className="text-xs">
					{statusLabel(task.status)}
				</Badge>
			</div>
			{menuItem.snack_request && (
				<div className="mb-1">
					<SnackRequestTag request={menuItem.snack_request} />
					{menuItem.snack_request.destination && <p className="mt-1 text-xs text-muted-foreground">Destino: {menuItem.snack_request.destination}</p>}
				</div>
			)}
			<SheetTitle className="text-lg leading-snug">{recipe?.name ?? menuItem.recipe_origin?.name ?? "Preparação"}</SheetTitle>
			{facts.hasDescription && (
				<SheetDescription className="flex flex-wrap items-center gap-3 mt-1">
					{facts.plannedPortions != null && (
						<span className="flex items-center gap-1">
							<Utensils className="size-3.5" />
							{facts.plannedPortions} porções planejadas
						</span>
					)}
					{facts.preparationMinutes != null && (
						<span className="flex items-center gap-1">
							<Timer className="size-3.5" />
							{facts.preparationMinutes} min
						</span>
					)}
					{facts.portionYield != null && (
						<span className="flex items-center gap-1 text-muted-foreground">
							<ChefHat className="size-3.5" />
							rendimento base: {facts.portionYield} porções
						</span>
					)}
				</SheetDescription>
			)}
		</SheetHeader>
	)
}

function ExecutionNotices({ menuItem }: { menuItem: ProductionMenuItem }) {
	if (!(menuItem.execution || menuItem.recipe_gaps.length > 0)) return null
	return (
		<div className="px-4 pt-4 space-y-2">
			{menuItem.execution && (
				<p className="text-caption text-muted-foreground">
					Incluída no turno às{" "}
					{new Date(menuItem.execution.added_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
					{menuItem.execution.reason ? ` — ${menuItem.execution.reason}` : ""}
					{menuItem.execution.reviewed ? " · revisada pela nutricionista" : " · aguardando revisão da nutricionista"}
				</p>
			)}
			{menuItem.recipe_gaps.length > 0 && (
				<div className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/10 p-3 text-sm text-warning" role="status">
					<AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<p>
						{describeSnapshotGaps(menuItem.recipe_gaps)} Produza normalmente; a nutricionista completa a ficha e a saída de estoque se lança pela quantidade
						real.
					</p>
				</div>
			)}
		</div>
	)
}

function IngredientsSection({ recipe, facts }: { recipe: ProductionRecipe; facts: TaskSheetFacts }) {
	if (!(recipe?.ingredients && recipe.ingredients.length > 0)) {
		return <div className="p-4 text-sm text-muted-foreground italic">Nenhum ingrediente cadastrado para esta receita.</div>
	}
	return (
		<div className="p-4 space-y-2">
			<h3 className="text-subheading text-foreground flex items-center gap-2">
				<Utensils className="size-4 text-muted-foreground" />
				Ingredientes
				{facts.isScaled && <span className="text-hint text-muted-foreground">(quantidades para {facts.plannedPortions} porções)</span>}
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
						{recipe.ingredients
							.toSorted((a, b) => (a.priority_order ?? 0) - (b.priority_order ?? 0))
							.map((ingredient) => (
								<TableRow key={ingredient.id} className={ingredient.is_optional ? "opacity-60" : undefined}>
									<TableCell className="text-subheading">
										{ingredient.ingredient?.description ?? "—"}
										{ingredient.is_optional && <span className="ml-1.5 text-xs text-muted-foreground">(opcional)</span>}
									</TableCell>
									<TableCell className="text-right tabular-nums">{scaleIngredientQty(ingredient.net_quantity, facts)}</TableCell>
									<TableCell className="text-muted-foreground text-xs">{ingredient.ingredient?.measure_unit ?? "—"}</TableCell>
								</TableRow>
							))}
					</TableBody>
				</Table>
			</div>
		</div>
	)
}

function SubstitutionsSection({ substitutionEntries, recipe }: { substitutionEntries: [string, SubstitutionEntry][]; recipe: ProductionRecipe }) {
	return (
		<div className="px-4 pb-4 space-y-1">
			<h3 className="text-subheading text-foreground flex items-center gap-2">
				<ArrowLeftRight className="size-4 text-warning" />
				Substituições ativas
			</h3>
			<div className="rounded-md border border-warning/30 bg-warning/5 p-2 space-y-1">
				{substitutionEntries.map(([key, entry]) => {
					// Troca de preparação feita no agendamento: o turno precisa saber de onde veio.
					if (key === "recipe_swap") {
						return (
							<p key={key} className="text-xs text-foreground">
								<span className="text-subheading">Preparação trocada</span>
								{entry?.from_recipe_name ? <span> (era {entry.from_recipe_name})</span> : null}
								{entry?.rationale ? <span className="text-muted-foreground"> — {entry.rationale}</span> : null}
							</p>
						)
					}
					const ingredientName = recipe?.ingredients?.find((i) => i.ingredient?.id === key)?.ingredient?.description
					return (
						<p key={key} className="text-xs text-foreground">
							<span className="text-subheading">{ingredientName ?? "Insumo"}</span>
							{entry?.substitute_description ? <span> → {entry.substitute_description}</span> : null}
							{entry?.rationale ? <span className="text-muted-foreground"> — {entry.rationale}</span> : null}
						</p>
					)
				})}
			</div>
		</div>
	)
}

function TaskTimestamps({ task }: { task: ProductionTask }) {
	return (
		(task.started_at || task.completed_at) && (
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
		)
	)
}

function TaskActions({
	task,
	onUpdateStatus,
	isUpdating,
}: {
	task: ProductionTask
	onUpdateStatus: (taskId: string, status: ProductionTaskStatus) => void
	isUpdating: boolean
}) {
	return (
		<SheetFooter className="border-t border-border">
			{task.status === "PENDING" && (
				<Button className="w-full" onClick={() => onUpdateStatus(task.id, "IN_PROGRESS")} disabled={isUpdating}>
					<PlayCircle className="size-4" />
					Iniciar Preparo
				</Button>
			)}
			{task.status === "IN_PROGRESS" && (
				<>
					<Button variant="success" className="flex-1" onClick={() => onUpdateStatus(task.id, "DONE")} disabled={isUpdating}>
						<CheckCircle2 className="size-4" />
						Marcar como Pronto
					</Button>
					<Button variant="ghost" onClick={() => onUpdateStatus(task.id, "PENDING")} disabled={isUpdating}>
						<RotateCcw className="size-4" />
						Desfazer
					</Button>
				</>
			)}
			{task.status === "DONE" && (
				<Button variant="outline" className="w-full" onClick={() => onUpdateStatus(task.id, "PENDING")} disabled={isUpdating}>
					<RotateCcw className="size-4" />
					Reabrir Preparo
				</Button>
			)}
		</SheetFooter>
	)
}
