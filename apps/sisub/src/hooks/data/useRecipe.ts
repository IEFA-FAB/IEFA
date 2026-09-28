import type { EditScope } from "@iefa/sisub-domain"
import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchRecipeFn, fetchRecipeLineageHeadFn, fetchRecipeVersionsFn } from "@/server/recipes.fn"

export function useRecipe(id: string | undefined) {
	return useQuery({
		queryKey: queryKeys.recipes.detail(id),
		queryFn: () => fetchRecipeFn({ data: { recipeId: id as string } }),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	})
}

export function useRecipeVersions(recipeId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.recipes.versions(recipeId),
		queryFn: () => fetchRecipeVersionsFn({ data: { recipeId: recipeId as string } }),
		enabled: !!recipeId,
		staleTime: 5 * 60 * 1000,
	})
}

/**
 * Versão vigente da linhagem de `recipeId` no contexto de edição. O editor compara com a
 * versão aberta: se outra pessoa gravou depois, avisa antes de o Salvar ser recusado. Curta
 * e com refetch no foco — é justamente a aba esquecida aberta que precisa descobrir isso.
 */
export function useRecipeLineageHead(recipeId: string | undefined, context: EditScope) {
	const kitchenId = context.scope === "kitchen" ? context.kitchenId : null
	return useQuery({
		queryKey: queryKeys.recipes.lineageHead(recipeId, kitchenId),
		queryFn: () => fetchRecipeLineageHeadFn({ data: { recipeId: recipeId as string, context } }),
		enabled: !!recipeId,
		staleTime: 30 * 1000,
		refetchOnWindowFocus: true,
	})
}
