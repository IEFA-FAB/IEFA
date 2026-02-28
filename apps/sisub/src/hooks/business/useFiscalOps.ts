import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
	addOtherPresenceFn,
	fetchOtherPresencesCountFn,
	fetchScanForecastFn,
} from "@/server/messhall.fn"
import type { FiscalFilters } from "@/types/domain/presence"

// QUERY KEYS
const opsKeys = {
	othersCount: (date: string, meal: string, messHallId: number) =>
		["othersCount", date, meal, messHallId] as const,
}

// ============================================================================
// OTHERS PRESENCE
// ============================================================================

export function useOtherPresencesCount(filters: FiscalFilters) {
	return useQuery({
		queryKey: opsKeys.othersCount(filters.date, filters.meal, filters.messHallId),
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
			queryClient.invalidateQueries({ queryKey: ["othersCount"] })
			toast.success("Outro registrado", {
				description: "Entrada sem cadastro adicionada com sucesso.",
			})
		},
		onError: (error) => {
			console.error("Erro ao registrar Outros:", error)
			toast.error("Erro", { description: "Não foi possível registrar a entrada." })
		},
	})
}

// ============================================================================
// SCAN PROCESSING
// ============================================================================

export function useScanProcessor() {
	const processScan = async (
		uuid: string,
		filters: FiscalFilters,
	): Promise<{ systemForecast: boolean | null }> => {
		const systemForecast = await fetchScanForecastFn({
			data: {
				userId: uuid,
				date: filters.date,
				meal: filters.meal,
				messHallId: filters.messHallId,
			},
		})
		return { systemForecast }
	}

	return { processScan }
}
