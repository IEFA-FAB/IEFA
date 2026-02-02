import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import supabase from "@/lib/supabase"
import type { RecipeFormData } from "@/types/domain/recipes"

export function useCreateRecipe() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: RecipeFormData) => {
			// 1. Insert recipe
			const { data: recipe, error: recipeError } = await supabase
				.from("recipes")
				.insert({
					name: data.name,
					preparation_method: data.preparation_method,
					portion_yield: data.portion_yield,
					preparation_time_minutes: data.preparation_time_minutes,
					cooking_factor: data.cooking_factor,
					rational_id: data.rational_id,
					kitchen_id: data.kitchen_id,
					version: 1, // Start at version 1
				})
				.select()
				.single()

			if (recipeError) throw recipeError

			// 2. Insert ingredients if any
			// Note: In strict mode we should have used data.ingredients, but type uses RecipeIngredientFormData
			// Assuming data passed respects the shape
			// @ts-expect-error - TODO: fix typing here strictly
			const ingredients = data.ingredients || []

			if (ingredients.length > 0) {
				const { error: ingredientsError } = await supabase.from("recipe_ingredients").insert(
					ingredients.map((ing: any) => ({
						recipe_id: recipe.id,
						product_id: ing.product_id,
						net_quantity: ing.net_quantity,
						is_optional: ing.is_optional,
						priority_order: ing.priority_order,
					}))
				)

				if (ingredientsError) throw ingredientsError
			}

			return recipe
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["recipes"] })
			toast.success("Receita criada com sucesso")
		},
		onError: (error) => {
			toast.error(`Erro ao criar receita: ${error.message}`)
		},
	})
}

export function useVersionRecipe() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			baseRecipeId,
			data,
			newVersion,
		}: {
			baseRecipeId: string
			data: RecipeFormData
			newVersion: number
		}) => {
			// 1. Create NEW recipe (Immutable Versioning: INSERT not UPDATE)
			const { data: recipe, error: recipeError } = await supabase
				.from("recipes")
				.insert({
					name: data.name,
					preparation_method: data.preparation_method,
					portion_yield: data.portion_yield,
					preparation_time_minutes: data.preparation_time_minutes,
					cooking_factor: data.cooking_factor,
					rational_id: data.rational_id,
					kitchen_id: data.kitchen_id, // Kitchen of current user context
					base_recipe_id: baseRecipeId, // Link to original
					version: newVersion, // Incremented version
				})
				.select()
				.single()

			if (recipeError) throw recipeError

			// 2. Insert new ingredients
			// @ts-expect-error
			const ingredients = data.ingredients || []

			if (ingredients.length > 0) {
				const { error: ingredientsError } = await supabase.from("recipe_ingredients").insert(
					ingredients.map((ing: any) => ({
						recipe_id: recipe.id,
						product_id: ing.product_id,
						net_quantity: ing.net_quantity,
						is_optional: ing.is_optional,
						priority_order: ing.priority_order,
					}))
				)

				if (ingredientsError) throw ingredientsError
			}

			return recipe
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["recipes"] })
			toast.success("Nova versão criada com sucesso")
		},
		onError: (error) => {
			toast.error(`Erro ao atualizar receita: ${error.message}`)
		},
	})
}
