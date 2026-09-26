import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import { fetchExecutionReviewStatusFn, reviewExecutionMenuItemFn } from "@/server/execution-review.fn"
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

/** Status do fluxo "Revisar a execução" da cozinha: o que o turno resolveu e ficou para revisar. */
export function useExecutionReviewStatus(kitchenId: number | null) {
	return useQuery({
		queryKey: queryKeys.flows.executionReview(kitchenId),
		queryFn: () => fetchExecutionReviewStatusFn({ data: { kitchenId: kitchenId as number } }),
		enabled: kitchenId != null,
		staleTime: 0,
		refetchOnMount: "always",
	})
}

/** Marca como revisada uma inclusão do turno. */
export function useReviewExecutionMenuItem(kitchenId: number) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (menuItemId: string) => reviewExecutionMenuItemFn({ data: { menuItemId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.flows.executionReview(kitchenId) })
			queryClient.invalidateQueries({ queryKey: queryKeys.production.all() })
			toast.success("Inclusão marcada como revisada")
		},
		onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao registrar a revisão"),
	})
}
