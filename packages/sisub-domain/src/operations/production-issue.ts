/**
 * Baixa por produção (Fase 5): consumo teórico calculado do SNAPSHOT congelado
 * da receita (`menu_items.recipe`, json), nunca da receita viva — o que foi
 * produzido é o registro auditável (MCASP), imune a edições posteriores.
 *
 * A fórmula é a mesma dos dois motores de procurement (scaleIngredientQuantity);
 * a alocação em lotes usa FEFO (stock-math). Módulo puro: o chamador entrega o
 * snapshot e o efetivo, aqui só a matemática.
 */

import { scaleIngredientQuantity } from "./demand-math.ts"

export interface SnapshotIngredientRow {
	ingredient_id?: string | null
	net_quantity?: number | string | null
	ingredient?: { description?: string | null; measure_unit?: string | null } | null
}

export interface RecipeSnapshotForIssue {
	portion_yield?: number | string | null
	ingredients?: SnapshotIngredientRow[] | null
}

export interface TheoreticalConsumption {
	ingredientId: string
	description: string
	measureUnit: string | null
	quantity: number
}

/**
 * Consumo teórico por ingrediente do snapshot × efetivo planejado.
 * Linhas sem ingredient_id (XOR frouxo do schema permite) ou sem quantidade
 * são ignoradas; ingredientes repetidos somam.
 */
export function computeTheoreticalConsumption(snapshot: RecipeSnapshotForIssue | null | undefined, plannedPortions: number): TheoreticalConsumption[] {
	if (!snapshot?.ingredients || plannedPortions <= 0) return []
	const portionYield = Number(snapshot.portion_yield ?? 0)

	const byIngredient = new Map<string, TheoreticalConsumption>()
	for (const row of snapshot.ingredients) {
		const ingredientId = row.ingredient_id ?? null
		if (!ingredientId) continue
		const net = Number(row.net_quantity ?? 0)
		if (!Number.isFinite(net) || net <= 0) continue

		const quantity = scaleIngredientQuantity(net, plannedPortions, portionYield)
		const existing = byIngredient.get(ingredientId)
		if (existing) {
			existing.quantity = Number((existing.quantity + quantity).toFixed(4))
		} else {
			byIngredient.set(ingredientId, {
				ingredientId,
				description: row.ingredient?.description ?? "(sem descrição)",
				measureUnit: row.ingredient?.measure_unit ?? null,
				quantity: Number(quantity.toFixed(4)),
			})
		}
	}
	return [...byIngredient.values()]
}

/** Validade de sobra congelada: data da produção + shelf_life_days (null = sem validade). */
export function leftoverExpiryDate(productionDate: string, shelfLifeDays: number | null | undefined): string | null {
	if (shelfLifeDays == null || shelfLifeDays <= 0) return null
	const base = new Date(`${productionDate}T00:00:00Z`)
	if (Number.isNaN(base.getTime())) return null
	base.setUTCDate(base.getUTCDate() + shelfLifeDays)
	return base.toISOString().substring(0, 10)
}
