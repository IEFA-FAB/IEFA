import type { QuantityEstimate } from "@iefa/database/sisub"
import type { ProcurementNeed, QuantityEstimateStatus } from "@iefa/sisub-domain"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import {
	calculateQuantityEstimateNeedsFn,
	createQuantityEstimateDraftFn,
	createQuantityEstimateFn,
	deleteQuantityEstimateFn,
	fetchQuantityEstimateDetailsFn,
	fetchQuantityEstimateListFn,
	finalizeQuantityEstimateDraftFn,
	saveQuantityEstimateDraftItemsFn,
	updateQuantityEstimateDraftFn,
	updateQuantityEstimateItemDescriptionFn,
	updateQuantityEstimateItemPricesFn,
	updateQuantityEstimateLimitsFn,
	updateQuantityEstimateStatusFn,
} from "@/server/quantity-estimate.fn"
import type { QuantityEstimateWithDetails, QuantityEstimateWizardState } from "@/types/domain/quantity-estimate"

// ─── Query Hooks ──────────────────────────────────────────────────────────────

export function useQuantityEstimateDraft(draftId: string | null) {
	return useQuery({
		queryKey: queryKeys.quantityEstimate.draft(draftId),
		queryFn: () => fetchQuantityEstimateDetailsFn({ data: { quantityEstimateId: draftId as string } }) as Promise<QuantityEstimateWithDetails | null>,
		enabled: draftId !== null,
		staleTime: 0,
	})
}

export function useQuantityEstimateList(unitId: number | null) {
	return useQuery({
		queryKey: queryKeys.quantityEstimate.list(unitId),
		queryFn: () => fetchQuantityEstimateListFn({ data: { unitId: unitId as number } }) as Promise<QuantityEstimate[]>,
		enabled: unitId !== null,
		staleTime: 5 * 60 * 1000,
	})
}

export function useQuantityEstimateDetails(quantityEstimateId: string | null) {
	return useQuery({
		queryKey: queryKeys.quantityEstimate.details(quantityEstimateId),
		queryFn: () =>
			fetchQuantityEstimateDetailsFn({ data: { quantityEstimateId: quantityEstimateId as string } }) as Promise<QuantityEstimateWithDetails | null>,
		enabled: quantityEstimateId !== null,
		staleTime: 5 * 60 * 1000,
	})
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────

export function useCalculateQuantityEstimateNeeds() {
	return useMutation({
		mutationFn: (state: QuantityEstimateWizardState) =>
			calculateQuantityEstimateNeedsFn({
				data: { kitchenSelections: state.kitchenSelections, segmentId: state.segmentId ?? null },
			}),
		onError: (error) => toast.error(`Erro ao calcular necessidades: ${error.message}`),
	})
}

export function useCreateQuantityEstimate() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({
			unitId,
			wizardState,
			items,
			researchLinks,
		}: {
			unitId: number
			wizardState: QuantityEstimateWizardState
			items: ProcurementNeed[]
			researchLinks?: Array<{ ingredientId: string; researchId: string; researchItemId: string }>
		}) =>
			createQuantityEstimateFn({
				data: {
					unitId,
					title: wizardState.title,
					notes: wizardState.notes || undefined,
					kitchenSelections: wizardState.kitchenSelections,
					items,
					researchLinks,
				},
			}),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.quantityEstimate.listAll() })
			toast.success(`Anexo "${data?.title}" criado com sucesso!`)
		},
		onError: (error) => toast.error(`Erro ao criar anexo quantitativo: ${error.message}`),
	})
}

export function useUpdateQuantityEstimateStatus() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ quantityEstimateId, status }: { quantityEstimateId: string; status: QuantityEstimateStatus }) =>
			updateQuantityEstimateStatusFn({ data: { quantityEstimateId, status } }),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.quantityEstimate.all() })
			const labels: Record<string, string> = {
				draft: "Rascunho",
				published: "Concluído",
				archived: "Arquivado",
			}
			toast.success(`Anexo atualizado para "${labels[variables.status]}"`)
		},
		onError: (error) => toast.error(`Erro ao atualizar status: ${error.message}`),
	})
}

export function useDeleteQuantityEstimate() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (quantityEstimateId: string) => deleteQuantityEstimateFn({ data: { quantityEstimateId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.quantityEstimate.listAll() })
			toast.success("Anexo removido.")
		},
		onError: (error) => toast.error(`Erro ao remover anexo quantitativo: ${error.message}`),
	})
}

export function useCreateQuantityEstimateDraft() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (unitId: number) => createQuantityEstimateDraftFn({ data: { unitId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.quantityEstimate.listAll() })
		},
		onError: (error) => toast.error(`Erro ao criar rascunho: ${error.message}`),
	})
}

export function useUpdateQuantityEstimateDraft() {
	return useMutation({
		mutationFn: (params: {
			draftId: string
			title?: string
			notes?: string
			wizardStep?: number
			validityMonths?: number
			kitchenSelections?: QuantityEstimateWizardState["kitchenSelections"]
			segmentId?: string | null
		}) => updateQuantityEstimateDraftFn({ data: params }),
		onError: (error) => toast.error(`Erro ao salvar rascunho: ${error.message}`),
	})
}

export function useSaveQuantityEstimateDraftItems() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: {
			draftId: string
			items: ProcurementNeed[]
			researchLinks?: Array<{ ingredientId: string; researchId: string; researchItemId: string }>
		}) =>
			saveQuantityEstimateDraftItemsFn({ data: params }) as Promise<{
				savedIds: Array<{ ingredientId: string; quantityEstimateItemId: string }>
				unlinkedResearchCount: number
			}>,
		onSuccess: (result, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.quantityEstimate.draft(variables.draftId) })
			if (result.unlinkedResearchCount > 0) {
				toast.warning(
					`${result.unlinkedResearchCount} pesquisa${result.unlinkedResearchCount !== 1 ? "s" : ""} de preço desvinculada${result.unlinkedResearchCount !== 1 ? "s" : ""} (item removido da lista).`
				)
			}
		},
		onError: (error) => toast.error(`Erro ao salvar itens: ${error.message}`),
	})
}

export function useUpdateQuantityEstimateItemPrices() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: {
			quantityEstimateId: string
			updates: Array<{ quantityEstimateItemId: string; price: number }>
			researchLinks?: Array<{ quantityEstimateItemId: string; researchId: string; researchItemId: string }>
		}) => updateQuantityEstimateItemPricesFn({ data: params }),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.quantityEstimate.details(variables.quantityEstimateId) })
			toast.success("Preços atualizados com sucesso!")
		},
		onError: (error) => toast.error(`Erro ao atualizar preços: ${error.message}`),
	})
}

export function useUpdateQuantityEstimateItemDescription() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: { quantityEstimateId: string; quantityEstimateItemId: string; description: string }) =>
			updateQuantityEstimateItemDescriptionFn({ data: { quantityEstimateItemId: params.quantityEstimateItemId, description: params.description || null } }),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.quantityEstimate.details(variables.quantityEstimateId) })
		},
		onError: (error) => toast.error(`Erro ao atualizar descrição: ${error.message}`),
	})
}

/**
 * Ajuste do anexo de quantitativos. Invalida detalhe e rascunho: o mesmo anexo é lido pelas
 * duas chaves (tela de detalhe e wizard).
 */
export function useUpdateQuantityEstimateLimits() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: Parameters<typeof updateQuantityEstimateLimitsFn>[0]["data"]) => updateQuantityEstimateLimitsFn({ data }),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.quantityEstimate.details(variables.quantityEstimateId) })
			queryClient.invalidateQueries({ queryKey: queryKeys.quantityEstimate.draft(variables.quantityEstimateId) })
		},
		onError: (error) => toast.error(`Erro ao ajustar limites: ${error.message}`),
	})
}

export function useFinalizeQuantityEstimateDraft() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: {
			draftId: string
			title: string
			notes?: string
			items: ProcurementNeed[]
			researchLinks?: Array<{ ingredientId: string; researchId: string; researchItemId: string }>
		}) => finalizeQuantityEstimateDraftFn({ data: params }),
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.quantityEstimate.listAll() })
			queryClient.removeQueries({ queryKey: queryKeys.quantityEstimate.draft(variables.draftId) })
			toast.success(`Anexo "${data?.title}" salvo com sucesso!`)
		},
		onError: (error) => toast.error(`Erro ao finalizar anexo quantitativo: ${error.message}`),
	})
}
