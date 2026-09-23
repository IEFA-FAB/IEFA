/**
 * Pedido de Lanche de Bordo/Apoio — queries e mutations (Comensal e Gestão Cozinha).
 *
 * Toda mutation invalida a família inteira `snack_request` e o quadro de produção: o aceite
 * põe itens no quadro, o cancelamento tira.
 */

import type {
	AdvanceSnackRequest,
	CreateSnackRequest,
	DecideSnackRequest,
	KitchenCancelSnackRequest,
	RegisterSnackMaterialReturn,
	RegisterSnackPickup,
	SetSnackClassification,
	SnackLabelData,
	SnackOrderingContext,
	SnackRequestDetail,
	SnackRequestSummary,
	SnackStandardEnergyDetail,
} from "@iefa/sisub-domain"
import type { SnackProductionSummary, SnackRequestStatus, SnackStandardSnapshot } from "@iefa/sisub-domain/utils"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import {
	advanceSnackRequestFn,
	cancelKitchenSnackRequestFn,
	cancelMySnackRequestFn,
	closeSnackRequestFn,
	createSnackRequestFn,
	decideSnackRequestFn,
	fetchKitchenSnackRequestFn,
	fetchKitchenSnackRequestsFn,
	fetchMySnackRequestFn,
	fetchMySnackRequestsFn,
	fetchOrderableSnackStandardsFn,
	fetchSnackLabelDataFn,
	fetchSnackMealTypeFn,
	fetchSnackOrderingContextFn,
	fetchSnackProductionSummaryFn,
	fetchSnackStandardEnergyFn,
	registerSnackMaterialReturnFn,
	registerSnackPickupFn,
	setSnackClassificationFn,
} from "@/server/snack-requests.fn"

// ─── Comensal ────────────────────────────────────────────────────────────────

export const snackOrderingContextQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.snackRequests.orderingContext(),
		queryFn: () => fetchSnackOrderingContextFn() as Promise<SnackOrderingContext>,
		staleTime: 5 * 60 * 1000,
	})

export const orderableSnackStandardsQueryOptions = (kitchenId: number | null) =>
	queryOptions({
		queryKey: queryKeys.snackRequests.orderable(kitchenId),
		queryFn: () => fetchOrderableSnackStandardsFn({ data: { kitchenId: kitchenId as number } }) as Promise<SnackStandardSnapshot[]>,
		enabled: kitchenId != null,
		staleTime: 60 * 1000,
	})

export const mySnackRequestsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.snackRequests.mine(),
		queryFn: () => fetchMySnackRequestsFn() as Promise<SnackRequestSummary[]>,
		staleTime: 30 * 1000,
	})

export const mySnackRequestQueryOptions = (requestId: string) =>
	queryOptions({
		queryKey: queryKeys.snackRequests.myDetail(requestId),
		queryFn: () => fetchMySnackRequestFn({ data: { requestId } }) as Promise<SnackRequestDetail>,
		staleTime: 30 * 1000,
	})

export function useCreateSnackRequest() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: CreateSnackRequest) => createSnackRequestFn({ data }) as Promise<SnackRequestDetail>,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.snackRequests.all() })
			toast.success("Pedido enviado à cozinha.")
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useCancelMySnackRequest() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: { requestId: string; reason?: string }) => cancelMySnackRequestFn({ data }) as Promise<SnackRequestDetail>,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.snackRequests.all() })
			queryClient.invalidateQueries({ queryKey: queryKeys.production.all() })
			toast.success("Pedido cancelado.")
		},
		onError: (error) => toast.error(error.message),
	})
}

// ─── Gestão Cozinha ──────────────────────────────────────────────────────────

export type KitchenSnackListParams = { from?: string; to?: string; statuses?: SnackRequestStatus[] }

export const kitchenSnackRequestsQueryOptions = (kitchenId: number, params: KitchenSnackListParams) =>
	queryOptions({
		queryKey: queryKeys.snackRequests.kitchenList(kitchenId, params),
		queryFn: () => fetchKitchenSnackRequestsFn({ data: { kitchenId, ...params } }) as Promise<SnackRequestSummary[]>,
		staleTime: 30 * 1000,
	})

export const kitchenSnackRequestQueryOptions = (requestId: string) =>
	queryOptions({
		queryKey: queryKeys.snackRequests.kitchenDetail(requestId),
		queryFn: () => fetchKitchenSnackRequestFn({ data: { requestId } }) as Promise<SnackRequestDetail>,
		staleTime: 15 * 1000,
	})

export const snackLabelQueryOptions = (requestId: string) =>
	queryOptions({
		queryKey: queryKeys.snackRequests.label(requestId),
		queryFn: () => fetchSnackLabelDataFn({ data: { requestId } }) as Promise<SnackLabelData>,
	})

export const snackProductionSummaryQueryOptions = (kitchenId: number, date: string) =>
	queryOptions({
		queryKey: queryKeys.snackRequests.production(kitchenId, date),
		queryFn: () => fetchSnackProductionSummaryFn({ data: { kitchenId, date } }) as Promise<SnackProductionSummary & { requests: SnackRequestSummary[] }>,
		staleTime: 30 * 1000,
	})

function useKitchenSnackMutation<TInput>(fn: (input: TInput) => Promise<SnackRequestDetail>, success: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: fn,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.snackRequests.all() })
			queryClient.invalidateQueries({ queryKey: queryKeys.production.all() })
			toast.success(success)
		},
		onError: (error) => toast.error(error.message),
	})
}

export const useDecideSnackRequest = () =>
	useKitchenSnackMutation((data: DecideSnackRequest) => decideSnackRequestFn({ data }) as Promise<SnackRequestDetail>, "Decisão registrada.")

export const useAdvanceSnackRequest = () =>
	useKitchenSnackMutation((data: AdvanceSnackRequest) => advanceSnackRequestFn({ data }) as Promise<SnackRequestDetail>, "Andamento registrado.")

export const useRegisterSnackPickup = () =>
	useKitchenSnackMutation((data: RegisterSnackPickup) => registerSnackPickupFn({ data }) as Promise<SnackRequestDetail>, "Retirada registrada.")

export const useRegisterSnackMaterialReturn = () =>
	useKitchenSnackMutation(
		(data: RegisterSnackMaterialReturn) => registerSnackMaterialReturnFn({ data }) as Promise<SnackRequestDetail>,
		"Devolução registrada."
	)

export const useCloseSnackRequest = () =>
	useKitchenSnackMutation((requestId: string) => closeSnackRequestFn({ data: { requestId } }) as Promise<SnackRequestDetail>, "Pedido encerrado.")

export const useCancelKitchenSnackRequest = () =>
	useKitchenSnackMutation((data: KitchenCancelSnackRequest) => cancelKitchenSnackRequestFn({ data }) as Promise<SnackRequestDetail>, "Pedido cancelado.")

// ─── Padrões ─────────────────────────────────────────────────────────────────

export const snackStandardEnergyQueryOptions = (templateId: string) =>
	queryOptions({
		queryKey: queryKeys.snackRequests.standardEnergy(templateId),
		queryFn: () => fetchSnackStandardEnergyFn({ data: { templateId } }) as Promise<SnackStandardEnergyDetail>,
		staleTime: 60 * 1000,
	})

export function useSnackMealType(enabled: boolean) {
	return useQuery({
		queryKey: queryKeys.snackRequests.snackMealType(),
		queryFn: () => fetchSnackMealTypeFn(),
		enabled,
		staleTime: 60 * 60 * 1000,
	})
}

export function useSetSnackClassification() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: SetSnackClassification) => setSnackClassificationFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.snackRequests.all() })
			queryClient.invalidateQueries({ queryKey: queryKeys.templates.all() })
		},
		onError: (error) => toast.error(error.message),
	})
}
