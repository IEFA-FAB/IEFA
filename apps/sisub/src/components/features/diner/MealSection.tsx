import type { DishDetails } from "@/hooks/data/useDailyMenuContent"
import { DishCard } from "./DishCard"

const MEAL_LABELS: Record<string, string> = {
	cafe: "Café da Manhã",
	almoco: "Almoço",
	janta: "Jantar",
	ceia: "Ceia",
}

export function MealSection({ mealKey, dishes }: { mealKey: string; dishes: DishDetails[] }) {
	return (
		<div className="space-y-2">
			<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{MEAL_LABELS[mealKey] ?? mealKey}</h3>
			{dishes.length === 0 ? (
				<p className="text-sm text-muted-foreground italic">Sem cardápio planejado.</p>
			) : (
				<div className="space-y-2">
					{dishes.map((dish) => (
						<DishCard key={dish.id} dish={dish} />
					))}
				</div>
			)}
		</div>
	)
}
