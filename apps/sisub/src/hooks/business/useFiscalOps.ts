import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "@/lib/query-keys"
import { addOtherPresenceFn, fetchOtherPresencesCountFn, fetchUserMealForecastFn } from "@/server/messhall.fn"
import type { FiscalFilters } from "@/types/domain/presence"

// ============================================================================
// OTHERS PRESENCE
// ============================================================================

export function useOtherPresencesCount(filters: FiscalFilters) {
	return useQuery({
		queryKey: queryKeys.presences.othersCount(filters.date, filters.meal, filters.messHallId),
		queryFn: () =>
			fetchOtherPresencesCountFn({
				data: { date: filters.date, meal: filters.meal, messHallId: filters.messHallId },
			}),
		enabled: !!filters.date && !!filters.meal && !!filters.messHallId,
	})
}

export function useAddOtherPresence() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({ filters, adminId }: { filters: FiscalFilters; adminId: string }) => {
			await addOtherPresenceFn({
				data: {
					adminId,
					date: filters.date,
					meal: filters.meal,
					messHallId: filters.messHallId,
				},
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.presences.othersCountAll() })
			toast.success("Outro registrado", {
				description: "Entrada sem cadastro adicionada com sucesso.",
			})
		},
		onError: (_error) => {
			toast.error("Erro", { description: "Não foi possível registrar a entrada." })
		},
	})
}

// ============================================================================
// SCAN PROCESSING
// ============================================================================

export function useScanProcessor() {
	const processScan = async (uuid: string, filters: FiscalFilters): Promise<{ systemForecast: boolean | null }> => {
		const result = await fetchUserMealForecastFn({
			data: {
				userId: uuid,
				date: filters.date,
				meal: filters.meal,
				messHallId: filters.messHallId,
			},
		})
		return { systemForecast: result?.will_eat ?? null }
	}

	return { processScan }
}
