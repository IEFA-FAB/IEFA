import type { ProcurementList } from "@iefa/database/sisub"
import type { ProcurementNeed } from "@iefa/sisub-domain"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import {
	calculateAtaNeedsFn,
	createAtaDraftFn,
	createAtaFn,
	deleteAtaFn,
	fetchAtaDetailsFn,
	fetchAtaListFn,
	finalizeAtaDraftFn,
	saveAtaDraftItemsFn,
	updateAtaDraftFn,
	updateAtaItemDescriptionFn,
	updateAtaItemPricesFn,
	updateAtaQuantityLimitsFn,
	updateAtaStatusFn,
} from "@/server/ata.fn"
import type { AtaWithDetails, AtaWizardState } from "@/types/domain/ata"

// ─── Query Hooks ──────────────────────────────────────────────────────────────

export function useAtaDraft(draftId: string | null) {
	return useQuery({
		queryKey: queryKeys.ata.draft(draftId),
		queryFn: () => fetchAtaDetailsFn({ data: { ataId: draftId as string } }) as Promise<AtaWithDetails | null>,
		enabled: draftId !== null,
		staleTime: 0,
	})
}

export function useAtaList(unitId: number | null) {
	return useQuery({
		queryKey: queryKeys.ata.list(unitId),
		queryFn: () => fetchAtaListFn({ data: { unitId: unitId as number } }) as Promise<ProcurementList[]>,
		enabled: unitId !== null,
		staleTime: 5 * 60 * 1000,
	})
}

export function useAtaDetails(ataId: string | null) {
	return useQuery({
		queryKey: queryKeys.ata.details(ataId),
		queryFn: () => fetchAtaDetailsFn({ data: { ataId: ataId as string } }) as Promise<AtaWithDetails | null>,
		enabled: ataId !== null,
		staleTime: 5 * 60 * 1000,
	})
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────

export function useCalculateAtaNeeds() {
	return useMutation({
		mutationFn: (state: AtaWizardState) =>
			calculateAtaNeedsFn({
				data: { kitchenSelections: state.kitchenSelections, segmentId: state.segmentId ?? null },
			}),
		onError: (error) => toast.error(`Erro ao calcular necessidades: ${error.message}`),
	})
}

export function useCreateAta() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({
			unitId,
			wizardState,
			items,
			researchLinks,
		}: {
			unitId: number
			wizardState: AtaWizardState
			items: ProcurementNeed[]
			researchLinks?: Array<{ ingredientId: string; researchId: string; researchItemId: string }>
		}) =>
			createAtaFn({
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
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.listAll() })
			toast.success(`Anexo "${data?.title}" criado com sucesso!`)
		},
		onError: (error) => toast.error(`Erro ao criar anexo quantitativo: ${error.message}`),
	})
}

export function useUpdateAtaStatus() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ ataId, status }: { ataId: string; status: "draft" | "published" | "archived" }) => updateAtaStatusFn({ data: { ataId, status } }),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.all() })
			const labels: Record<string, string> = {
				draft: "Rascunho",
				published: "Publicado",
				archived: "Arquivado",
			}
			toast.success(`Anexo atualizado para "${labels[variables.status]}"`)
		},
		onError: (error) => toast.error(`Erro ao atualizar status: ${error.message}`),
	})
}

export function useDeleteAta() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (ataId: string) => deleteAtaFn({ data: { ataId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.listAll() })
			toast.success("Anexo removido.")
		},
		onError: (error) => toast.error(`Erro ao remover anexo quantitativo: ${error.message}`),
	})
}

export function useCreateAtaDraft() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (unitId: number) => createAtaDraftFn({ data: { unitId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.listAll() })
		},
		onError: (error) => toast.error(`Erro ao criar rascunho: ${error.message}`),
	})
}

export function useUpdateAtaDraft() {
	return useMutation({
		mutationFn: (params: {
			draftId: string
			title?: string
			notes?: string
			wizardStep?: number
			validityMonths?: number
			kitchenSelections?: AtaWizardState["kitchenSelections"]
			segmentId?: string | null
		}) => updateAtaDraftFn({ data: params }),
		onError: (error) => toast.error(`Erro ao salvar rascunho: ${error.message}`),
	})
}

export function useSaveAtaDraftItems() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: {
			draftId: string
			items: ProcurementNeed[]
			researchLinks?: Array<{ ingredientId: string; researchId: string; researchItemId: string }>
		}) =>
			saveAtaDraftItemsFn({ data: params }) as Promise<{
				savedIds: Array<{ ingredientId: string; ataItemId: string }>
				unlinkedResearchCount: number
			}>,
		onSuccess: (result, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.draft(variables.draftId) })
			if (result.unlinkedResearchCount > 0) {
				toast.warning(
					`${result.unlinkedResearchCount} pesquisa${result.unlinkedResearchCount !== 1 ? "s" : ""} de preço desvinculada${result.unlinkedResearchCount !== 1 ? "s" : ""} (item removido da lista).`
				)
			}
		},
		onError: (error) => toast.error(`Erro ao salvar itens: ${error.message}`),
	})
}

export function useUpdateAtaItemPrices() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: {
			ataId: string
			updates: Array<{ ataItemId: string; price: number }>
			researchLinks?: Array<{ ataItemId: string; researchId: string; researchItemId: string }>
		}) => updateAtaItemPricesFn({ data: params }),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.details(variables.ataId) })
			toast.success("Preços atualizados com sucesso!")
		},
		onError: (error) => toast.error(`Erro ao atualizar preços: ${error.message}`),
	})
}

export function useUpdateAtaItemDescription() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: { ataId: string; ataItemId: string; description: string }) =>
			updateAtaItemDescriptionFn({ data: { ataItemId: params.ataItemId, description: params.description || null } }),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.details(variables.ataId) })
		},
		onError: (error) => toast.error(`Erro ao atualizar descrição: ${error.message}`),
	})
}

/**
 * Ajuste do anexo de quantitativos. Invalida detalhe e rascunho: a mesma ATA é lida pelas
 * duas chaves (tela de detalhe e wizard).
 */
export function useUpdateAtaQuantityLimits() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: Parameters<typeof updateAtaQuantityLimitsFn>[0]["data"]) => updateAtaQuantityLimitsFn({ data }),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.details(variables.ataId) })
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.draft(variables.ataId) })
		},
		onError: (error) => toast.error(`Erro ao ajustar limites: ${error.message}`),
	})
}

export function useFinalizeAtaDraft() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: {
			draftId: string
			title: string
			notes?: string
			items: ProcurementNeed[]
			researchLinks?: Array<{ ingredientId: string; researchId: string; researchItemId: string }>
		}) => finalizeAtaDraftFn({ data: params }),
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.listAll() })
			queryClient.removeQueries({ queryKey: queryKeys.ata.draft(variables.draftId) })
			toast.success(`Anexo "${data?.title}" salvo com sucesso!`)
		},
		onError: (error) => toast.error(`Erro ao finalizar anexo quantitativo: ${error.message}`),
	})
}
