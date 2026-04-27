import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { fetchRecipesFn, fetchRecipeWithIngredientsFn } from "@/server/recipes.fn"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

/**
 * Busca todas as receitas uma única vez com query key estável.
 * Filtragem (search, global/local) é feita client-side via useMemo
 * para evitar requests por keystroke e manter UX instantânea.
 */
export function useRecipes(filters?: { kitchen_id?: number | null; search?: string; origin?: "all" | "global" | "local" }) {
	const query = useQuery({
		queryKey: ["recipes", { kitchen_id: filters?.kitchen_id ?? null }],
		queryFn: () => fetchRecipesFn({ data: { kitchenId: filters?.kitchen_id } }),
		staleTime: 5 * 60 * 1000, // 5 minutes
	})

	const data = useMemo(() => {
		if (!query.data) return query.data

		const search = filters?.search?.toLowerCase().trim()
		const origin = filters?.origin ?? "all"

		return query.data.filter((r) => {
			if (search && !r.name.toLowerCase().includes(search)) return false
			if (origin === "global" && r.kitchen_id !== null) return false
			if (origin === "local" && r.kitchen_id === null) return false
			return true
		})
	}, [query.data, filters?.search, filters?.origin])

	return { ...query, data }
}

/**
 * Fetch a single recipe with all ingredients and product details.
 * Used when creating menu_items to generate the recipe snapshot.
 */
export async function fetchRecipeWithIngredients(recipeId: string): Promise<RecipeWithIngredients> {
	return fetchRecipeWithIngredientsFn({ data: { recipeId } })
}
