import type { ProcurementList } from "@iefa/database/sisub"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
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
				data: { kitchenSelections: state.kitchenSelections },
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
			items: Awaited<ReturnType<typeof calculateAtaNeedsFn>>
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
			toast.success(`Ata "${data?.title}" criada com sucesso!`)
		},
		onError: (error) => toast.error(`Erro ao criar ata: ${error.message}`),
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
				published: "Publicada",
				archived: "Arquivada",
			}
			toast.success(`Ata atualizada para "${labels[variables.status]}"`)
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
			toast.success("Ata removida.")
		},
		onError: (error) => toast.error(`Erro ao remover ata: ${error.message}`),
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
		mutationFn: (params: { draftId: string; title?: string; notes?: string; wizardStep?: number; kitchenSelections?: AtaWizardState["kitchenSelections"] }) =>
			updateAtaDraftFn({ data: params }),
		onError: (error) => toast.error(`Erro ao salvar rascunho: ${error.message}`),
	})
}

export function useSaveAtaDraftItems() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: {
			draftId: string
			items: Awaited<ReturnType<typeof calculateAtaNeedsFn>>
			researchLinks?: Array<{ ingredientId: string; researchId: string; researchItemId: string }>
		}) =>
			saveAtaDraftItemsFn({ data: params }) as Promise<{
				savedIds: Array<{ ingredientId: string; ataItemId: string }>
			}>,
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.draft(variables.draftId) })
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

export function useFinalizeAtaDraft() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: {
			draftId: string
			title: string
			notes?: string
			items: Awaited<ReturnType<typeof calculateAtaNeedsFn>>
			researchLinks?: Array<{ ingredientId: string; researchId: string; researchItemId: string }>
		}) => finalizeAtaDraftFn({ data: params }),
		onSuccess: (data, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.listAll() })
			queryClient.removeQueries({ queryKey: queryKeys.ata.draft(variables.draftId) })
			toast.success(`Ata "${data?.title}" salva com sucesso!`)
		},
		onError: (error) => toast.error(`Erro ao finalizar ata: ${error.message}`),
	})
}
