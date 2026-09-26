import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchDemandForecastStatusFn, fetchProcurementPlanningStatusFn } from "@/server/procurement-flows.fn"

/**
 * Status do fluxo "Planejar contratação" da OM. Relido sempre que o fluxo abre: quem volta de
 * uma etapa precisa ver o efeito do que acabou de fazer, não o cache de antes.
 */
export function useProcurementPlanningStatus(unitId: number | null) {
	return useQuery({
		queryKey: queryKeys.flows.procurementPlanning(unitId),
		queryFn: () => fetchProcurementPlanningStatusFn({ data: { unitId: unitId as number } }),
		enabled: unitId != null,
		staleTime: 0,
		refetchOnMount: "always",
	})
}

/** Status do fluxo "Prever demanda para compra" da cozinha. */
export function useDemandForecastStatus(kitchenId: number | null) {
	return useQuery({
		queryKey: queryKeys.flows.demandForecast(kitchenId),
		queryFn: () => fetchDemandForecastStatusFn({ data: { kitchenId: kitchenId as number } }),
		enabled: kitchenId != null,
		staleTime: 0,
		refetchOnMount: "always",
	})
}
