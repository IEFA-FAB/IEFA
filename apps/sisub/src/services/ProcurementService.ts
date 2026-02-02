import { queryOptions } from "@tanstack/react-query"
import supabase from "@/lib/supabase"

// ============================================================================
// TYPES
// ============================================================================

export interface ProcurementNeed {
	folder_id: string | null
	folder_description: string | null
	product_id: string
	product_name: string
	measure_unit: string | null
	total_quantity: number
}

export interface ProcurementParams {
	startDate: string
	endDate: string
	kitchenId?: number
}

// ============================================================================
// FETCHERS
// ============================================================================

/**
 * Calcula necessidades de compra para um período
 *
 * Agregação client-side:
 * 1. Busca menu_items no período
 * 2. Para cada item, pega a receita original e ingredientes
 * 3. Calcula quantidade necessária: (net_quantity * planned_portions / portion_yield)
 * 4. Agrupa por produto e soma quantidades
 * 5. Ordena por categoria (folder)
 *
 * @param params Filtros de período e kitchen
 * @returns Lista de produtos com quantidades necessárias
 */
export async function fetchProcurementNeeds(params: ProcurementParams): Promise<ProcurementNeed[]> {
	const { startDate, endDate, kitchenId } = params

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
		.eq("excluded_from_procurement", 0) // Não excluídos de compra

	if (kitchenId) {
		menuQuery = menuQuery.eq("daily_menu.kitchen_id", kitchenId)
	}

	const { data: menuItems, error: menuError } = await menuQuery

	if (menuError) {
		throw new Error(`Erro ao buscar itens do cardápio: ${menuError.message}`)
	}

	if (!menuItems || menuItems.length === 0) {
		return []
	}

	// 2. Coletar IDs únicos de receitas
	const recipeIds = [
		...new Set(
			menuItems.map((item) => item.recipe_origin_id).filter((id): id is string => id !== null)
		),
	]

	if (recipeIds.length === 0) {
		return []
	}

	// 3. Buscar receitas com ingredientes e produtos
	const { data: recipes, error: recipesError } = await supabase
		.from("recipes")
		.select(
			`
      id,
      portion_yield,
      recipe_ingredients (
        product_id,
        net_quantity,
        product (
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

	if (recipesError) {
		throw new Error(`Erro ao buscar receitas: ${recipesError.message}`)
	}

	if (!recipes || recipes.length === 0) {
		return []
	}

	// 4. Calcular necessidades por produto
	const needsMap = new Map<
		string,
		{
			product: {
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
		if (!recipe || !recipe.recipe_ingredients) continue

		const portionMultiplier = (menuItem.planned_portion_quantity || 0) / (recipe.portion_yield || 1)

		for (const ingredient of recipe.recipe_ingredients) {
			if (!ingredient.product) continue

			const productId = ingredient.product_id
			const quantityNeeded = (ingredient.net_quantity || 0) * portionMultiplier

			if (needsMap.has(productId)) {
				const existing = needsMap.get(productId)
				if (existing) {
					existing.total_quantity += quantityNeeded
				}
			} else {
				needsMap.set(productId, {
					product: ingredient.product,
					total_quantity: quantityNeeded,
				})
			}
		}
	}

	// 5. Converter para array e formatar
	const needs: ProcurementNeed[] = Array.from(needsMap.entries()).map(([productId, data]) => ({
		folder_id: data.product.folder_id,
		folder_description: data.product.folder?.description || null,
		product_id: productId,
		product_name: data.product.description,
		measure_unit: data.product.measure_unit,
		total_quantity: Number(data.total_quantity.toFixed(4)),
	}))

	// 6. Ordenar por categoria e produto
	needs.sort((a, b) => {
		const folderA = a.folder_description || "Sem categoria"
		const folderB = b.folder_description || "Sem categoria"
		if (folderA !== folderB) {
			return folderA.localeCompare(folderB, "pt-BR")
		}
		return a.product_name.localeCompare(b.product_name, "pt-BR")
	})

	return needs
}

// ============================================================================
// QUERY OPTIONS
// ============================================================================

export const procurementNeedsQueryOptions = (params: ProcurementParams) =>
	queryOptions({
		queryKey: ["procurement", "needs", params] as const,
		queryFn: () => fetchProcurementNeeds(params),
		staleTime: 1000 * 60 * 5, // 5 minutos
		gcTime: 1000 * 60 * 15, // 15 minutos
		enabled: !!params.startDate && !!params.endDate,
	})
