import type { DishDetails } from "@/hooks/data/useDailyMenuContent"
import { DishCard } from "./DishCard"

const MEAL_LABELS: Record<string, string> = {
	cafe: "Café da Manhã",
	almoco: "Almoço",
	janta: "Jantar",
	ceia: "Ceia",
}

/**
 * Agrupa preservando a ordem em que os pratos chegam — o servidor já os entrega
 * na ordem de leitura do conjunto da refeição (grupo, depois posição) e com o
 * rótulo resolvido. Reordenar aqui exigiria conhecer o conjunto, e a tela do
 * comensal não tem permissão para lê-lo.
 */
function groupDishes(dishes: DishDetails[]): { key: string; label: string; items: DishDetails[] }[] {
	const out: { key: string; label: string; items: DishDetails[] }[] = []
	for (const dish of dishes) {
		const key = dish.group ?? "__ungrouped__"
		const last = out[out.length - 1]
		if (last?.key === key) {
			last.items.push(dish)
			continue
		}
		const existing = out.find((g) => g.key === key)
		if (existing) existing.items.push(dish)
		else out.push({ key, label: dish.group_label ?? (dish.group ? dish.group.replace(/_/g, " ") : "Sem grupo"), items: [dish] })
	}
	return out
}

export function MealSection({ mealKey, dishes }: { mealKey: string; dishes: DishDetails[] }) {
	const groups = groupDishes(dishes)
	// Só exibimos os cabeçalhos de grupo se algum prato tiver grupo atribuído.
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
