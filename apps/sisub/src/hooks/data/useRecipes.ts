import { useQuery } from "@tanstack/react-query"
import { fetchRecipesFn, fetchRecipeWithIngredientsFn } from "@/server/recipes.fn"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

export function useRecipes(filters?: {
	kitchen_id?: number | null
	search?: string
	global_only?: boolean
}) {
	return useQuery({
		queryKey: ["recipes", filters],
		queryFn: () => fetchRecipesFn({ data: filters ?? {} }),
		staleTime: 5 * 60 * 1000, // 5 minutes
	})
}

/**
 * Fetch a single recipe with all ingredients and product details.
 * Used when creating menu_items to generate the recipe snapshot.
 */
export async function fetchRecipeWithIngredients(recipeId: string): Promise<RecipeWithIngredients> {
	return fetchRecipeWithIngredientsFn({ data: { id: recipeId } })
}
