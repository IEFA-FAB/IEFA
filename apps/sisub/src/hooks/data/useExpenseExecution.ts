import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { createDesignationFn, endDesignationFn, listDesignationCandidatesFn, listDesignationScopesFn, listDesignationsFn } from "@/server/designation.fn"
import { fetchExpenseExecutionStatusFn, fetchReceivingPendingStatusFn } from "@/server/expense-execution.fn"

/**
 * Status do fluxo "Executar despesa" da OM. Relido sempre que o fluxo abre: quem volta de uma
 * etapa precisa ver o efeito do que acabou de fazer.
 */
export function useExpenseExecutionStatus(unitId: number | null) {
	return useQuery({
		queryKey: queryKeys.flows.expenseExecution(unitId),
		queryFn: () => fetchExpenseExecutionStatusFn({ data: { unitId: unitId as number } }),
		enabled: unitId != null,
		staleTime: 0,
		refetchOnMount: "always",
	})
}

/** Pendências do recebimento da cozinha, para o painel "a caminho". */
export function useReceivingPendingStatus(kitchenId: number | null) {
	return useQuery({
		queryKey: queryKeys.flows.receivingPending(kitchenId),
		queryFn: () => fetchReceivingPendingStatusFn({ data: { kitchenId: kitchenId as number } }),
		enabled: kitchenId != null,
		staleTime: 0,
		refetchOnMount: "always",
	})
}

export function useDesignations(unitId: number | null) {
	return useQuery({
		queryKey: queryKeys.designations.list(unitId),
		queryFn: () => listDesignationsFn({ data: { unitId: unitId as number } }),
		enabled: unitId != null,
	})
}

export function useDesignationCandidates(unitId: number | null, enabled = true) {
	return useQuery({
		queryKey: queryKeys.designations.candidates(unitId),
		queryFn: () => listDesignationCandidatesFn({ data: { unitId: unitId as number } }),
		enabled: unitId != null && enabled,
	})
}

export function useDesignationScopes(unitId: number | null, enabled = true) {
	return useQuery({
		queryKey: queryKeys.designations.scopes(unitId),
		queryFn: () => listDesignationScopesFn({ data: { unitId: unitId as number } }),
		enabled: unitId != null && enabled,
	})
}

type CreateDesignationInput = Parameters<typeof createDesignationFn>[0]["data"]

export function useCreateDesignation(unitId: number | null) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: CreateDesignationInput) => createDesignationFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.designations.list(unitId) })
			queryClient.invalidateQueries({ queryKey: ["flows"] })
		},
	})
}

export function useEndDesignation(unitId: number | null) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (designationId: string) => endDesignationFn({ data: { designationId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.designations.list(unitId) })
			queryClient.invalidateQueries({ queryKey: ["flows"] })
		},
	})
}
