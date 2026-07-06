import type { FrozenPreparation } from "@iefa/database/sisub"
import type { FrozenPreparationCategory, FrozenPreparationWrite } from "@iefa/sisub-domain"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFrozenPreparationFn, deleteFrozenPreparationFn, listFrozenPreparationsFn, updateFrozenPreparationFn } from "@/server/frozen_preparation.fn"

const KEY = ["frozen-preparations"] as const

export type FrozenPreparationFilters = { search?: string; category?: FrozenPreparationCategory }

export const frozenPreparationsQueryOptions = (params: FrozenPreparationFilters = {}) =>
	queryOptions({
		queryKey: [...KEY, "list", params.search ?? "", params.category ?? "all"],
		queryFn: () => listFrozenPreparationsFn({ data: params }) as Promise<FrozenPreparation[]>,
		staleTime: 5 * 60 * 1000,
	})

export function useFrozenPreparations(params?: FrozenPreparationFilters) {
	const { data, error, refetch, isLoading } = useQuery(frozenPreparationsQueryOptions(params))
	return { frozenPreparations: data, error, refetch, isLoading }
}

export function useCreateFrozenPreparation() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (payload: FrozenPreparationWrite) => createFrozenPreparationFn({ data: { payload } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	})
}

export function useUpdateFrozenPreparation() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (args: { id: string; payload: Partial<FrozenPreparationWrite> }) => updateFrozenPreparationFn({ data: args }),
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	})
}

export function useDeleteFrozenPreparation() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (id: string) => deleteFrozenPreparationFn({ data: { id } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	})
}
