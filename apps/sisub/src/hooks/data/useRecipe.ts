import { useQuery } from "@tanstack/react-query"
import { fetchRecipeFn } from "@/server/recipes.fn"

export function useRecipe(id: string | undefined) {
	return useQuery({
		queryKey: ["recipe", id],
		queryFn: () => fetchRecipeFn({ data: { id: id! } }),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	})
}
