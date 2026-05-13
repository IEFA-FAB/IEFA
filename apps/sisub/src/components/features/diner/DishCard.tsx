import { Badge } from "@/components/ui/badge"
import type { DishDetails } from "@/hooks/data/useDailyMenuContent"

export function DishCard({ dish }: { dish: DishDetails }) {
	const hasIngredients = dish.ingredients && dish.ingredients.length > 0
	return (
		<div className="rounded-md border bg-card p-3 space-y-2">
			<p className="text-sm font-medium text-foreground">{dish.name}</p>
			{hasIngredients && (
				<div className="flex flex-wrap gap-1">
					{dish.ingredients.map((ing) => (
						<Badge key={ing.ingredient_name} variant="secondary" className="text-xs">
							{ing.ingredient_name}
						</Badge>
					))}
				</div>
			)}
		</div>
	)
}
