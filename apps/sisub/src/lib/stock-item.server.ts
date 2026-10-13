/**
 * @module stock-item.server
 * O `inventory` identifica o item por `item_id` (→ `core.item`), de qualquer classe. A tela do
 * cozinha fala a língua da alimentação: insumo (`kitchen.ingredient`) ou preparação congelada
 * (`kitchen.frozen_preparation`), que são subtipos de `core.item` com a MESMA chave. Este módulo
 * faz a tradução na fronteira da server function, nos dois sentidos, para a UI do sisub não
 * precisar saber que o estoque é multiclasse.
 */

import { readAllPagesIn } from "@/lib/read-all-pages"
import { getServerClient } from "@/lib/supabase.server"

/** O item como a tela da cozinha o identifica: um dos dois preenchido. */
export type FoodItemRef = { ingredientId: string | null; frozenPreparationId: string | null }

/** `item_id` do estoque a partir do par da tela. */
export function itemIdOf(ref: { ingredientId?: string | null; frozenPreparationId?: string | null }): string {
	const id = ref.ingredientId ?? ref.frozenPreparationId
	if (!id) throw new Error("Informe o insumo ou a preparação.")
	return id
}

/**
 * Classifica `item_id`s do estoque em insumo ou preparação congelada. O que não é preparação é
 * tratado como insumo: no local de uma cozinha só entram alimentação e auxiliar, e os dois vêm
 * de `kitchen.ingredient`.
 */
export async function classifyFoodItems(itemIds: readonly string[]): Promise<Map<string, FoodItemRef>> {
	const unique = [...new Set(itemIds.filter(Boolean))]
	const refs = new Map<string, FoodItemRef>()
	if (unique.length === 0) return refs
	const frozen = await readAllPagesIn("as preparações", unique, (chunk, from, to) =>
		getServerClient("kitchen").from("frozen_preparation").select("id").in("id", chunk).order("id").range(from, to)
	)
	const frozenIds = new Set(frozen.map((row) => row.id))
	for (const id of unique) refs.set(id, frozenIds.has(id) ? { ingredientId: null, frozenPreparationId: id } : { ingredientId: id, frozenPreparationId: null })
	return refs
}

/** O par da tela para um `item_id`, a partir do mapa de `classifyFoodItems`. */
export function foodRefOf(refs: Map<string, FoodItemRef>, itemId: string | null | undefined): FoodItemRef {
	if (!itemId) return { ingredientId: null, frozenPreparationId: null }
	return refs.get(itemId) ?? { ingredientId: itemId, frozenPreparationId: null }
}
