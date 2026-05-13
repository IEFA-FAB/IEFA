/**
 * @module procurement.fn
 * Aggregates ingredient quantities from live daily_menu data for a date range. Read-only pipeline, no persistence.
 * CLIENT: getSupabaseServerClient (service role).
 * TABLES: menu_items, daily_menu, recipes, recipe_ingredients, ingredient (all reads).
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { ProcurementNeed } from "@/services/ProcurementService"

/**
 * Computes total ingredient quantities for a kitchen or unit over a date range by walking menu_items → recipes → ingredients.
 *
 * @remarks
 * 6-step pipeline:
 *   (1) Resolve unit → kitchenIds if unitId provided.
 *   (2) Fetch menu_items with daily_menu join (excludes excluded_from_procurement=1 and soft-deleted).
 *   (3) Fetch unique recipes + ingredients.
 *   (4) Aggregate by ingredient_id: quantity = net_quantity × (plannedQty / portionYield).
 *   (5) Format quantities to 4 decimal places.
 *   (6) Sort by folder_description → ingredient_name (pt-BR collation).
 * Does NOT include catmat codes or unit_price — use calculateAtaNeedsFn for ATA creation (template-based).
 * If neither kitchenId nor unitId provided, query spans all kitchens.
 *
 * @throws {Error} on any Supabase query failure.
 */
export const fetchProcurementNeedsFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			startDate: z.string(),
			endDate: z.string(),
			kitchenId: z.number().optional(),
			unitId: z.number().optional(),
		})
	)
	.handler(async ({ data }): Promise<ProcurementNeed[]> => {
		const { startDate, endDate, kitchenId, unitId } = data
		const supabase = getSupabaseServerClient()

		// Quando filtrando por unidade, resolve os IDs de cozinha da unidade
		let kitchenIds: number[] | undefined
		if (unitId) {
			const { data: kitchens, error: kitchensError } = await supabase.from("kitchen").select("id").eq("unit_id", unitId)
			if (kitchensError) throw new Error(`Erro ao buscar cozinhas da unidade: ${kitchensError.message}`)
			kitchenIds = (kitchens ?? []).map((k) => k.id)
			if (kitchenIds.length === 0) return []
		}

		// 1. Buscar menu_items no período
		let menuQuery = supabase
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
		if (menuError) throw new Error(`Erro ao buscar itens do cardápio: ${menuError.message}`)
		if (!menuItems || menuItems.length === 0) return []

		// 2. Coletar IDs únicos de Preparações
		const recipeIds = [...new Set(menuItems.map((item) => item.recipe_origin_id).filter((id): id is string => id !== null))]
		if (recipeIds.length === 0) return []

		// 3. Buscar Preparações com ingredientes
		const { data: recipes, error: recipesError } = await supabase
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

		if (recipesError) throw new Error(`Erro ao buscar Preparações: ${recipesError.message}`)
		if (!recipes || recipes.length === 0) return []

		// 4. Calcular necessidades por ingrediente
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

				if (needsMap.has(ingredientId)) {
					const existing = needsMap.get(ingredientId)
					if (existing) existing.total_quantity += quantityNeeded
				} else {
					needsMap.set(ingredientId, { ingredient: normalizedIngredient, total_quantity: quantityNeeded })
				}
			}
		}

		// 5. Converter para array e formatar
		const needs: ProcurementNeed[] = Array.from(needsMap.entries()).map(([ingredientId, d]) => ({
			folder_id: d.ingredient.folder_id,
			folder_description: d.ingredient.folder?.description || null,
			ingredient_id: ingredientId,
			ingredient_name: d.ingredient.description,
			measure_unit: d.ingredient.measure_unit,
			total_quantity: Number(d.total_quantity.toFixed(4)),
			catmat_item_codigo: null,
			catmat_item_descricao: null,
			unit_price: null,
		}))

		// 6. Ordenar por categoria e ingrediente
		needs.sort((a, b) => {
			const folderA = a.folder_description || "Sem categoria"
			const folderB = b.folder_description || "Sem categoria"
			if (folderA !== folderB) return folderA.localeCompare(folderB, "pt-BR")
			return a.ingredient_name.localeCompare(b.ingredient_name, "pt-BR")
		})

		return needs
	})
