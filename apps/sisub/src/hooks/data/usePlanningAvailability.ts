import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchPlanningAvailabilityFn } from "@/server/planning-availability.fn"

/** Avisos de disponibilidade dos insumos agendados no período (datas civis, inclusive). */
export function usePlanningAvailability(kitchenId: number | null, startDate: string | null, endDate: string | null) {
	return useQuery({
		queryKey: queryKeys.planning.availability(kitchenId, startDate ?? "", endDate ?? ""),
		queryFn: () => fetchPlanningAvailabilityFn({ data: { kitchenId: kitchenId as number, startDate: startDate as string, endDate: endDate as string } }),
		enabled: Number.isInteger(kitchenId) && (kitchenId ?? 0) > 0 && !!startDate && !!endDate,
	})
}
