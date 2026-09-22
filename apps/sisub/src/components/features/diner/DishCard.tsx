import { Badge } from "@/components/ui/badge"
import type { DishDetails } from "@/hooks/data/useDailyMenuContent"

export function DishCard({ dish }: { dish: DishDetails }) {
	const hasIngredients = dish.ingredients && dish.ingredients.length > 0
	return (
		<div className="rounded-md border bg-card p-3 space-y-2">
			<div className="flex items-center justify-between gap-2">
				<p className="text-subheading text-foreground">{dish.name}</p>
				{dish.recommended_proportion != null && (
					// "70%" sozinho não dizia de quê. É a fatia do efetivo prevista para esta opção.
					<Badge variant="outline" className="text-xs shrink-0 tabular-nums">
						{/* Acima de 100% não é fatia do efetivo: é mais de uma porção por pessoa. */}
						{dish.recommended_proportion > 100 ? `${dish.recommended_proportion}% do per capita` : `${dish.recommended_proportion}% dos comensais`}
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
