import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import {
	createDemandForecastFn,
	deleteDemandForecastFn,
	fetchDemandForecastsFn,
	fetchPendingDemandForecastFn,
	recordDemandForecastImportFn,
	sendDemandForecastFn,
	updateDemandForecastFn,
} from "@/server/demand-forecast.fn"
import type { TemplateSelection } from "@/types/domain/ata"
import type { DemandForecastWithSelections } from "@/types/domain/demand-forecast"

// ─── Query Hooks ──────────────────────────────────────────────────────────────

export function useDemandForecasts(kitchenId: number | null) {
	return useQuery({
		queryKey: queryKeys.demandForecast.list(kitchenId),
		queryFn: () => fetchDemandForecastsFn({ data: { kitchenId: kitchenId as number } }) as Promise<DemandForecastWithSelections[]>,
		enabled: kitchenId !== null,
		staleTime: 5 * 60 * 1000,
	})
}

/**
 * A previsão de demanda mais recente enviada pela cozinha (enviada ou já recebida), com os
 * anexos em que a unidade já a importou. Usada no wizard do anexo.
 */
export function usePendingDemandForecast(kitchenId: number | null) {
	return useQuery({
		queryKey: queryKeys.demandForecast.pending(kitchenId),
		queryFn: () => fetchPendingDemandForecastFn({ data: { kitchenId: kitchenId as number } }) as Promise<DemandForecastWithSelections | null>,
		enabled: kitchenId !== null,
		staleTime: 2 * 60 * 1000,
	})
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────

export function useCreateDemandForecast() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ kitchenId, title, notes, selections }: { kitchenId: number; title: string; notes?: string; selections: TemplateSelection[] }) =>
			createDemandForecastFn({
				data: { kitchenId, title, notes, selections },
			}),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.demandForecast.listAll() })
			toast.success(`Previsão "${data?.title}" criada!`)
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useUpdateDemandForecast() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({
			forecastId,
			updates,
			selections,
		}: {
			forecastId: string
			updates: { title?: string; notes?: string | null }
			selections?: TemplateSelection[]
		}) =>
			updateDemandForecastFn({
				data: { forecastId, updates, selections },
			}),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.demandForecast.all() })
			toast.success(`Previsão "${data?.title}" atualizada!`)
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useSendDemandForecast() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (forecastId: string) => sendDemandForecastFn({ data: { forecastId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.demandForecast.all() })
			toast.success("Previsão enviada à unidade!")
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useDeleteDemandForecast() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (forecastId: string) => deleteDemandForecastFn({ data: { forecastId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.demandForecast.listAll() })
			toast.success("Previsão removida.")
		},
		onError: (error) => toast.error(error.message),
	})
}

/**
 * A unidade importou a previsão num anexo: registra a importação e, na primeira, a previsão passa
 * a "Recebida pela unidade" do lado da cozinha.
 */
export function useRecordDemandForecastImport(kitchenId: number) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: { forecastId: string; listId: string }) => recordDemandForecastImportFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.demandForecast.pending(kitchenId) })
			queryClient.invalidateQueries({ queryKey: queryKeys.demandForecast.list(kitchenId) })
		},
		onError: (error) => toast.error(`A previsão foi importada, mas o retorno à cozinha não foi registrado: ${error.message}`),
	})
}
