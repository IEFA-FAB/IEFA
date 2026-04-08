import { CheckCircle2, Clock, PlayCircle, RotateCcw, Timer, Utensils } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { ProductionItem, ProductionTaskStatus } from "@/types/domain/production"

interface ProductionTaskCardProps {
	item: ProductionItem
	onSelect: (item: ProductionItem) => void
	onUpdateStatus: (taskId: string, status: ProductionTaskStatus) => void
	isUpdating?: boolean
}

export function ProductionTaskCard({ item, onSelect, onUpdateStatus, isUpdating = false }: ProductionTaskCardProps) {
	const { task, menuItem, mealType } = item
	const recipe = menuItem.recipe_with_ingredients ?? menuItem.recipe_origin
	const recipeName = recipe?.name ?? "Preparação"
	const prepTime = (recipe as { preparation_time_minutes?: number | null } | null)?.preparation_time_minutes
	const portions = menuItem.planned_portion_quantity

	function handleActionClick(e: React.MouseEvent, status: ProductionTaskStatus) {
		e.stopPropagation()
		onUpdateStatus(task.id, status)
	}

	return (
		<Card
			variant="tile"
			size="sm"
			className="cursor-pointer hover:border-primary/30 hover:bg-muted/40 active:scale-[0.99] transition-all select-none"
			onClick={() => onSelect(item)}
		>
			<CardHeader className="border-b border-border/50 pb-2">
				<div className="flex items-start justify-between gap-2">
					<CardTitle className="text-sm leading-snug line-clamp-2 flex-1">{recipeName}</CardTitle>
				</div>
				{mealType?.name && (
					<Badge variant="secondary" className="text-xs w-fit mt-0.5">
						{mealType.name}
					</Badge>
				)}
			</CardHeader>

			<CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs text-muted-foreground">
				{portions && (
					<span className="flex items-center gap-1">
						<Utensils className="h-3 w-3" />
						{portions} porções
					</span>
				)}
				{prepTime && (
					<span className="flex items-center gap-1">
						<Timer className="h-3 w-3" />
						{prepTime} min
					</span>
				)}
				{task.status === "IN_PROGRESS" && task.started_at && (
					<span className="flex items-center gap-1 text-warning">
						<Clock className="h-3 w-3" />
						Iniciado às {new Date(task.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
					</span>
				)}
				{task.status === "DONE" && task.completed_at && (
					<span className="flex items-center gap-1 text-success">
						<CheckCircle2 className="h-3 w-3" />
						{new Date(task.completed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
					</span>
				)}
			</CardContent>

			<CardFooter className="bg-transparent border-t-0 pt-0 pb-2 px-3">
				{task.status === "PENDING" && (
					<Button size="sm" variant="outline" className="w-full" disabled={isUpdating} onClick={(e) => handleActionClick(e, "IN_PROGRESS")}>
						<PlayCircle className="h-3.5 w-3.5" />
						Iniciar
					</Button>
				)}
				{task.status === "IN_PROGRESS" && (
					<div className="flex gap-1.5 w-full">
						<Button size="sm" variant="success" className="flex-1" disabled={isUpdating} onClick={(e) => handleActionClick(e, "DONE")}>
							<CheckCircle2 className="h-3.5 w-3.5" />
							Concluir
						</Button>
						<Button size="sm" variant="ghost" disabled={isUpdating} onClick={(e) => handleActionClick(e, "PENDING")}>
							<RotateCcw className="h-3.5 w-3.5" />
						</Button>
					</div>
				)}
				{task.status === "DONE" && (
					<Button size="sm" variant="ghost" className="w-full text-muted-foreground" disabled={isUpdating} onClick={(e) => handleActionClick(e, "PENDING")}>
						<RotateCcw className="h-3.5 w-3.5" />
						Reabrir
					</Button>
				)}
			</CardFooter>
		</Card>
	)
}
