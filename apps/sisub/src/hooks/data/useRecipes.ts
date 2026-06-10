import { queryOptions, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { queryKeys } from "@/lib/query-keys"
import { normalizeForSearch } from "@/lib/text-search"
import { fetchRecipesFn, fetchRecipeWithIngredientsFn } from "@/server/recipes.fn"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

export const recipesQueryOptions = (kitchenId?: number | null, includeDeleted?: boolean) =>
	queryOptions({
		queryKey: queryKeys.recipes.list(kitchenId, includeDeleted),
		queryFn: () => fetchRecipesFn({ data: { kitchenId, includeDeleted } }),
		staleTime: 5 * 60 * 1000,
		gcTime: 5 * 60 * 1000,
	})

/**
 * Busca todas as receitas uma única vez com query key estável.
 * Filtragem (search, global/local) é feita client-side via useMemo
 * para evitar requests por keystroke e manter UX instantânea.
 */
export function useRecipes(filters?: {
	kitchen_id?: number | null
	search?: string
	origin?: "all" | "global" | "local"
	includeDeleted?: boolean
	/** Default: insensível a maiúsculas e acentos. */
	caseSensitive?: boolean
	accentSensitive?: boolean
	/** Ordenação alfabética por nome. Default: "asc" (A-Z). */
	sortDirection?: "asc" | "desc"
}) {
	const query = useQuery(recipesQueryOptions(filters?.kitchen_id, filters?.includeDeleted))

	const caseSensitive = filters?.caseSensitive ?? false
	const accentSensitive = filters?.accentSensitive ?? false
	const sortDirection = filters?.sortDirection ?? "asc"

	const data = useMemo(() => {
		if (!query.data) return query.data

		const sensitivity = { caseSensitive, accentSensitive }
		const search = filters?.search ? normalizeForSearch(filters.search, sensitivity).trim() : undefined
		const origin = filters?.origin ?? "all"

		const filtered = query.data.filter((r) => {
			if (search && !normalizeForSearch(r.name, sensitivity).includes(search)) return false
			if (origin === "global" && r.kitchen_id !== null) return false
			if (origin === "local" && r.kitchen_id === null) return false
			return true
		})

		const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true })
		const dir = sortDirection === "desc" ? -1 : 1
		return [...filtered].sort((a, b) => dir * collator.compare(a.name, b.name))
	}, [query.data, filters?.search, filters?.origin, caseSensitive, accentSensitive, sortDirection])

	return { ...query, data }
}

/**
 * Fetch a single recipe with all ingredients and product details.
 * Used when creating menu_items to generate the recipe snapshot.
 */
export async function fetchRecipeWithIngredients(recipeId: string): Promise<RecipeWithIngredients> {
	return fetchRecipeWithIngredientsFn({ data: { recipeId } })
}
