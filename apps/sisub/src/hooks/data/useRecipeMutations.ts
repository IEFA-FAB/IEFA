import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { createRecipeFn, createRecipeVersionFn } from "@/server/recipes.fn"
import type { RecipeFormData } from "@/types/domain/recipes"

export function useCreateRecipe() {
	const queryClient = useQueryClient()

	return useMutation({
		// @ts-expect-error - ingredients field is not in RecipeFormData type but is passed at runtime
		mutationFn: (data: RecipeFormData) => createRecipeFn({ data }),
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
		mutationFn: ({
			baseRecipeId,
			data,
			newVersion,
		}: {
			baseRecipeId: string
			data: RecipeFormData
			newVersion: number
		}) =>
			// @ts-expect-error - ingredients field is not in RecipeFormData type but is passed at runtime
			createRecipeVersionFn({
				data: { ...data, base_recipe_id: baseRecipeId, new_version: newVersion },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["recipes"] })
			toast.success("Nova versão criada com sucesso")
		},
		onError: (error) => {
			toast.error(`Erro ao atualizar receita: ${error.message}`)
		},
	})
}
