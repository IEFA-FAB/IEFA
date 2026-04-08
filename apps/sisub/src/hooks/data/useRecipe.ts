import { useQuery } from "@tanstack/react-query"
import { fetchRecipeFn, fetchRecipeVersionsFn } from "@/server/recipes.fn"

export function useRecipe(id: string | undefined) {
	return useQuery({
		queryKey: ["recipe", id],
		queryFn: () => fetchRecipeFn({ data: { id: id as string } }),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	})
}

export function useRecipeVersions(recipeId: string | undefined) {
	return useQuery({
		queryKey: ["recipe_versions", recipeId],
		queryFn: () => fetchRecipeVersionsFn({ data: { recipeId: recipeId as string } }),
		enabled: !!recipeId,
		staleTime: 5 * 60 * 1000,
	})
}
