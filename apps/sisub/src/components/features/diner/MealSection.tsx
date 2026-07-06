import type { DishDetails } from "@/hooks/data/useDailyMenuContent"
import { groupMenuItems } from "@/lib/menu-item-groups"
import { DishCard } from "./DishCard"

const MEAL_LABELS: Record<string, string> = {
	cafe: "Café da Manhã",
	almoco: "Almoço",
	janta: "Jantar",
	ceia: "Ceia",
}

export function MealSection({ mealKey, dishes }: { mealKey: string; dishes: DishDetails[] }) {
	// Os pratos já chegam ordenados por posição; agrupamos na ordem canônica de leitura.
	// Só exibimos os cabeçalhos de grupo se algum prato tiver grupo atribuído.
	const groups = groupMenuItems(dishes.map((dish, index) => ({ ...dish, item_group: dish.group, sort_order: index })))
	const hasGroups = groups.some((g) => g.key !== "__ungrouped__")

	return (
		<div className="space-y-2">
			<h3 className="text-label text-muted-foreground">{MEAL_LABELS[mealKey] ?? mealKey}</h3>
			{dishes.length === 0 ? (
				<p className="text-sm text-muted-foreground italic">Sem cardápio planejado.</p>
			) : hasGroups ? (
				<div className="space-y-3">
					{groups.map((group) => (
						<div key={group.key} className="space-y-1.5">
							<p className="text-xs uppercase tracking-wide text-muted-foreground/70">{group.label}</p>
							<div className="space-y-2">
								{group.items.map((dish) => (
									<DishCard key={dish.id} dish={dish} />
								))}
							</div>
						</div>
					))}
				</div>
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
