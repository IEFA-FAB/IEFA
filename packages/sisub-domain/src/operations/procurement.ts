/**
 * Procurement operations — canonical implementation.
 *
 * Aggregates ingredient quantities from daily_menu data over a date range.
 * Read-only pipeline; no persistence.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { requirePermission } from "../guards/require-permission.ts"
import type { FetchProcurementNeeds } from "../schemas/procurement.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import type { ProcurementNeed } from "../types/procurement.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

/**
 * 6-step pipeline:
 *   (1) Resolve unit → kitchenIds if unitId provided.
 *   (2) Fetch menu_items in date range (excludes excluded_from_procurement + soft-deleted).
 *   (3) Collect unique recipe IDs + fetch with ingredients.
 *   (4) Aggregate by ingredient_id: quantity = net_quantity × (plannedQty / portionYield).
 *   (5) Format quantities to 4 decimal places.
 *   (6) Sort by folder_description → ingredient_name (pt-BR collation).
 */
export async function fetchProcurementNeeds(client: AnyClient, ctx: UserContext, input: FetchProcurementNeeds): Promise<ProcurementNeed[]> {
	requirePermission(ctx, "kitchen", 1)

	const { startDate, endDate, kitchenId, unitId } = input

	let kitchenIds: number[] | undefined
	if (unitId) {
		const { data: kitchens, error: kitchensError } = await client.from("kitchen").select("id").eq("unit_id", unitId)
		if (kitchensError) throw new DomainError("QUERY_FAILED", `Erro ao buscar cozinhas da unidade: ${kitchensError.message}`)
		kitchenIds = (kitchens ?? []).map((k) => k.id)
		if (kitchenIds.length === 0) return []
	}

	let menuQuery = client
		.from("menu_items")
		.select(
			`
      id,
      planned_portion_quantity,
      excluded_from_procurement,
      recipe_origin_id,
      daily_menu!inner (
        service_date,
        kitchen_id
      )
    `
		)
		.gte("daily_menu.service_date", startDate)
		.lte("daily_menu.service_date", endDate)
		.is("deleted_at", null)
		.is("daily_menu.deleted_at", null)
		.eq("excluded_from_procurement", 0)

	if (kitchenId) {
		menuQuery = menuQuery.eq("daily_menu.kitchen_id", kitchenId)
	} else if (kitchenIds) {
		menuQuery = menuQuery.in("daily_menu.kitchen_id", kitchenIds)
	}

	const { data: menuItems, error: menuError } = await menuQuery
	if (menuError) throw new DomainError("QUERY_FAILED", `Erro ao buscar itens do cardápio: ${menuError.message}`)
	if (!menuItems || menuItems.length === 0) return []

	const recipeIds = [...new Set(menuItems.map((item) => item.recipe_origin_id).filter((id): id is string => id !== null))]
	if (recipeIds.length === 0) return []

	const { data: recipes, error: recipesError } = await client
		.from("recipes")
		.select(
			`
      id,
      portion_yield,
      recipe_ingredients (
        ingredient_id,
        net_quantity,
        ingredient (
          id,
          description,
          measure_unit,
          folder_id,
          folder (
            id,
            description
          )
        )
      )
    `
		)
		.in("id", recipeIds)

	if (recipesError) throw new DomainError("QUERY_FAILED", `Erro ao buscar preparações: ${recipesError.message}`)
	if (!recipes || recipes.length === 0) return []

	const needsMap = new Map<
		string,
		{
			ingredient: {
				id: string
				description: string
				measure_unit: string | null
				folder_id: string | null
				folder?: { id: string; description: string | null } | null
			}
			total_quantity: number
		}
	>()

	for (const menuItem of menuItems) {
		const recipe = recipes.find((r) => r.id === menuItem.recipe_origin_id)
		if (!recipe?.recipe_ingredients) continue

		const portionMultiplier = (menuItem.planned_portion_quantity || 0) / (recipe.portion_yield || 1)

		for (const ri of recipe.recipe_ingredients) {
			const ingredientRaw = Array.isArray(ri.ingredient) ? ri.ingredient[0] : ri.ingredient
			if (!ingredientRaw) continue

			const normalizedIngredient = {
				...ingredientRaw,
				folder: Array.isArray(ingredientRaw.folder) ? ingredientRaw.folder[0] : ingredientRaw.folder,
			}

			const ingredientId = ri.ingredient_id
			if (!ingredientId) continue
			const quantityNeeded = (ri.net_quantity || 0) * portionMultiplier

			const existing = needsMap.get(ingredientId)
			if (existing) {
				existing.total_quantity += quantityNeeded
			} else {
				needsMap.set(ingredientId, { ingredient: normalizedIngredient, total_quantity: quantityNeeded })
			}
		}
	}

	const needs: ProcurementNeed[] = Array.from(needsMap.entries()).map(([ingredientId, d]) => ({
		folder_id: d.ingredient.folder_id,
		folder_description: d.ingredient.folder?.description ?? null,
		ingredient_id: ingredientId,
		ingredient_name: d.ingredient.description,
		measure_unit: d.ingredient.measure_unit,
		total_quantity: Number(d.total_quantity.toFixed(4)),
		purchase_item_id: null,
		purchase_item_description: null,
		purchase_measure_unit: null,
		purchase_quantity: null,
		conversion_factor: null,
		catmat_item_codigo: null,
		catmat_item_descricao: null,
		unit_price: null,
		item_description: null,
	}))

	needs.sort((a, b) => {
		const folderA = a.folder_description ?? "Sem categoria"
		const folderB = b.folder_description ?? "Sem categoria"
		if (folderA !== folderB) return folderA.localeCompare(folderB, "pt-BR")
		return a.ingredient_name.localeCompare(b.ingredient_name, "pt-BR")
	})

	return needs
}
