import type { EditScope } from "@iefa/sisub-domain"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import { mapIngredients } from "@/lib/recipe-payload"
import { createRecipeFn, saveRecipeEditFn } from "@/server/recipes.fn"
import type { RecipeFormData } from "@/types/domain/recipes"

export function useCreateRecipe() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (data: RecipeFormData) =>
			createRecipeFn({
				data: {
					name: data.name,
					preparationMethod: data.preparation_method ?? undefined,
					prePreparationMethod: data.pre_preparation_method ?? undefined,
					portionYield: data.portion_yield,
					preparationTimeMinutes: data.preparation_time_minutes ?? undefined,
					cookingFactor: data.cooking_factor ?? undefined,
					rationalId: data.rational_id ?? undefined,
					kitchenId: data.kitchen_id ?? null,
					folderId: data.folder_id ?? null,
					ingredients: mapIngredients(data.ingredients),
				},
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all() })
			toast.success("Preparação criada com sucesso")
		},
		onError: (error) => {
			toast.error(`Erro ao criar Preparação: ${error.message}`)
		},
	})
}

/**
 * Salva a edição de uma receita existente.
 *
 * O `context` diz de QUAL tela a edição partiu e é obrigatório — o servidor usa isso para
 * decidir entre nova versão global e fork local. Antes o destino era derivado do
 * `kitchen_id` da receita carregada, o que fazia a edição de uma receita global feita na
 * tela de uma cozinha virar uma nova versão global, válida para toda a FAB. O número de
 * versão também não vem mais do cliente.
 */
export function useSaveRecipeEdit() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ baseRecipeId, data, context }: { baseRecipeId: string; data: RecipeFormData; context: EditScope }) =>
			saveRecipeEditFn({
				data: {
					name: data.name,
					preparationMethod: data.preparation_method ?? undefined,
					prePreparationMethod: data.pre_preparation_method ?? undefined,
					portionYield: data.portion_yield,
					preparationTimeMinutes: data.preparation_time_minutes ?? undefined,
					cookingFactor: data.cooking_factor ?? undefined,
					rationalId: data.rational_id ?? undefined,
					// Explícito (inclusive `null`): o formulário sempre carrega a pasta atual, então
					// o valor enviado é a intenção do usuário — omitir faria o servidor preservar a
					// pasta da versão base e o "Sem pasta" escolhido na tela não teria efeito.
					folderId: data.folder_id ?? null,
					baseRecipeId,
					context,
					ingredients: mapIngredients(data.ingredients),
				},
			}),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all() })
			toast.success(result.forked ? "Cópia local criada — a preparação global segue intacta" : "Nova versão criada com sucesso")
		},
		onError: (error) => {
			toast.error(`Erro ao atualizar Preparação: ${error.message}`)
		},
	})
}
