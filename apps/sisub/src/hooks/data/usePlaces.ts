import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "@/lib/query-keys"
import type { UpdateEntityInput } from "@/server/places.fn"
import { applyPlacesDiffFn, fetchPlacesGraphFn, updatePlacesEntityFn } from "@/server/places.fn"
import type { PlacesDiff } from "@/types/domain/places"

export type { UpdateEntityInput }

// ─── Query options (reusable for prefetch) ────────────────────────────────────

export const placesGraphQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.places.graph(),
		queryFn: () => fetchPlacesGraphFn(),
		staleTime: 10 * 60 * 1000,
	})

// ─── Read ─────────────────────────────────────────────────────────────────────

export function usePlacesGraph() {
	return useQuery(placesGraphQueryOptions())
}

// ─── Update entity attributes ─────────────────────────────────────────────────

export function useUpdatePlacesEntity() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: UpdateEntityInput) => updatePlacesEntityFn({ data: input }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.places.graph() })
			toast.success("Registro atualizado.")
		},
		onError: (e: Error) => toast.error(e.message),
	})
}

// ─── Apply pending relation diffs ─────────────────────────────────────────────

export function useApplyPlacesDiff() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (diffs: PlacesDiff[]) =>
			applyPlacesDiffFn({
				data: {
					diffs: diffs.map((d) =>
						d.table === "kitchen"
							? {
									table: "kitchen" as const,
									recordId: d.recordId,
									column: d.column,
									newValue: d.newValue,
								}
							: {
									table: "mess_halls" as const,
									recordId: d.recordId,
									column: d.column,
									newValue: d.newValue,
								}
					),
				},
			}),
		onMutate: () => {
			toast.loading("Salvando alterações...", { id: "places-save" })
		},
		onSuccess: (_, diffs) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.places.graph() })
			toast.success(`${diffs.length} alteração(ões) salva(s).`, { id: "places-save" })
		},
		onError: (e: Error) => {
			toast.error(`Erro ao salvar: ${e.message}`, { id: "places-save" })
		},
	})
}
