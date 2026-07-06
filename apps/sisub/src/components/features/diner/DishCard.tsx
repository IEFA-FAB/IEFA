import { Badge } from "@/components/ui/badge"
import type { DishDetails } from "@/hooks/data/useDailyMenuContent"

export function DishCard({ dish }: { dish: DishDetails }) {
	const hasIngredients = dish.ingredients && dish.ingredients.length > 0
	return (
		<div className="rounded-md border bg-card p-3 space-y-2">
			<div className="flex items-center justify-between gap-2">
				<p className="text-subheading text-foreground">{dish.name}</p>
				{dish.recommended_proportion != null && (
					<Badge variant="outline" className="text-xs shrink-0 tabular-nums">
						{dish.recommended_proportion}%
					</Badge>
				)}
			</div>
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
