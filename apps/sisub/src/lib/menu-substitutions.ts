/**
 * Leitura do snapshot da preparação gravado no item do dia (`menu_items.recipe`) e dos registros
 * de substituição (`menu_items.substitutions`).
 *
 * O snapshot é a ficha como estava na aplicação, no contrato snake_case do domínio: a lista de
 * insumos é `ingredients[]`, cada linha com `id` (linha da ficha), `ingredient_id`,
 * `net_quantity` e o insumo aninhado em `ingredient` (`description`, `measure_unit`).
 */
export type SnapshotIngredientLine = {
	/** Id da linha da ficha (`recipe_ingredients.id`) — chave dos substitutos previstos. */
	lineId: string
	/** Insumo que a linha usa — chave do registro de substituição. */
	ingredientId: string
	name: string
	quantityLabel: string
}

export type SubstitutionEntry = {
	type: string
	rationale: string
	updated_at: string
	substitute_ingredient_id?: string | null
	substitute_description?: string | null
	from_recipe_id?: string | null
	from_recipe_name?: string | null
}

type SnapshotLine = {
	id?: string
	ingredient_id?: string | null
	net_quantity?: number | string | null
	ingredient?: { description?: string | null; measure_unit?: string | null } | null
}

export function snapshotIngredientLines(recipe: unknown): SnapshotIngredientLine[] {
	const lines = (recipe as { ingredients?: SnapshotLine[] } | null)?.ingredients ?? []
	return lines.flatMap((l) => {
		if (!l.id || !l.ingredient_id) return []
		const qty = l.net_quantity == null ? "" : String(Number(l.net_quantity))
		const unit = l.ingredient?.measure_unit ?? ""
		return [{ lineId: l.id, ingredientId: l.ingredient_id, name: l.ingredient?.description ?? "Insumo sem nome", quantityLabel: `${qty} ${unit}`.trim() }]
	})
}

/** Quantos registros o item tem — insumo substituído ou preparação trocada. */
export function substitutionCount(substitutions: unknown): number {
	return substitutions && typeof substitutions === "object" ? Object.keys(substitutions).length : 0
}

/** Rótulo do selo do item: a troca de preparação pesa mais que o substituto de insumo. */
export function substitutionLabel(substitutions: unknown): string {
	const entries = substitutions && typeof substitutions === "object" ? (substitutions as Record<string, SubstitutionEntry>) : {}
	const swap = entries.recipe_swap
	const ingredients = Object.keys(entries).filter((k) => k !== "recipe_swap").length
	if (swap) return swap.from_recipe_name ? `Trocada (era ${swap.from_recipe_name})` : "Preparação trocada"
	return ingredients === 1 ? "1 insumo substituído" : `${ingredients} insumos substituídos`
}
