import { useQuery } from "@tanstack/react-query"
import supabase from "@/lib/supabase"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

export function useRecipes(filters?: {
	kitchen_id?: number | null
	search?: string
	global_only?: boolean
}) {
	return useQuery({
		queryKey: ["recipes", filters],
		queryFn: async () => {
			let query = supabase
				.from("recipes")
				.select(`
          *,
          ingredients:recipe_ingredients(
            *,
            product:product_id(*)
          )
        `)
				.is("deleted_at", null)
				.order("name")

			if (filters?.kitchen_id !== undefined && filters?.kitchen_id !== null) {
				query = query.eq("kitchen_id", filters.kitchen_id)
			}

			if (filters?.global_only) {
				query = query.is("kitchen_id", null)
			}

			if (filters?.search) {
				query = query.ilike("name", `%${filters.search}%`)
			}

			const { data, error } = await query
			if (error) throw error
			return data as RecipeWithIngredients[]
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	})
}

/**
 * Fetch a single recipe with all ingredients and product details.
 * Used when creating menu_items to generate the recipe snapshot.
 */
export async function fetchRecipeWithIngredients(recipeId: string): Promise<RecipeWithIngredients> {
	const { data, error } = await supabase
		.from("recipes")
		.select(`
      *,
      ingredients:recipe_ingredients(
        *,
        product:product_id(*)
      )
    `)
		.eq("id", recipeId)
		.is("deleted_at", null)
		.single()

	if (error) throw error
	if (!data) throw new Error(`Recipe ${recipeId} not found`)

	return data as RecipeWithIngredients
}
