import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { createRecipeFn, createRecipeVersionFn } from "@/server/recipes.fn"
import type { RecipeFormData } from "@/types/domain/recipes"

export function useCreateRecipe() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (data: RecipeFormData) =>
			createRecipeFn({
				data: {
					name: data.name,
					preparationMethod: data.preparation_method ?? undefined,
					portionYield: data.portion_yield,
					preparationTimeMinutes: data.preparation_time_minutes ?? undefined,
					cookingFactor: data.cooking_factor ?? undefined,
					rationalId: data.rational_id ?? undefined,
					kitchenId: data.kitchen_id ?? null,
				},
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["recipes"] })
			toast.success("Preparação criada com sucesso")
		},
		onError: (error) => {
			toast.error(`Erro ao criar Preparação: ${error.message}`)
		},
	})
}

export function useVersionRecipe() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ baseRecipeId, data, newVersion }: { baseRecipeId: string; data: RecipeFormData; newVersion: number }) =>
			createRecipeVersionFn({
				data: {
					name: data.name,
					preparationMethod: data.preparation_method ?? undefined,
					portionYield: data.portion_yield,
					preparationTimeMinutes: data.preparation_time_minutes ?? undefined,
					cookingFactor: data.cooking_factor ?? undefined,
					rationalId: data.rational_id ?? undefined,
					kitchenId: data.kitchen_id ?? null,
					baseRecipeId,
					version: newVersion,
				},
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["recipes"] })
			toast.success("Nova versão criada com sucesso")
		},
		onError: (error) => {
			toast.error(`Erro ao atualizar Preparação: ${error.message}`)
		},
	})
}
