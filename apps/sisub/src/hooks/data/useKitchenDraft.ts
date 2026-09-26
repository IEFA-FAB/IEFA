import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import {
	createKitchenDraftFn,
	deleteKitchenDraftFn,
	fetchKitchenDraftsFn,
	fetchPendingDraftFn,
	recordKitchenDraftImportFn,
	sendKitchenDraftFn,
	updateKitchenDraftFn,
} from "@/server/kitchen-draft.fn"
import type { DraftWithSelections, TemplateSelection } from "@/types/domain/ata"

// ─── Query Hooks ──────────────────────────────────────────────────────────────

export function useKitchenDrafts(kitchenId: number | null) {
	return useQuery({
		queryKey: queryKeys.kitchenDraft.list(kitchenId),
		queryFn: () => fetchKitchenDraftsFn({ data: { kitchenId: kitchenId as number } }) as Promise<DraftWithSelections[]>,
		enabled: kitchenId !== null,
		staleTime: 5 * 60 * 1000,
	})
}

/**
 * A previsão de demanda mais recente enviada pela cozinha (enviada ou já recebida), com os
 * anexos em que a unidade já a importou. Usada no wizard do anexo.
 */
export function usePendingDraft(kitchenId: number | null) {
	return useQuery({
		queryKey: queryKeys.kitchenDraft.pending(kitchenId),
		queryFn: () => fetchPendingDraftFn({ data: { kitchenId: kitchenId as number } }) as Promise<DraftWithSelections | null>,
		enabled: kitchenId !== null,
		staleTime: 2 * 60 * 1000,
	})
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────

export function useCreateKitchenDraft() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ kitchenId, title, notes, selections }: { kitchenId: number; title: string; notes?: string; selections: TemplateSelection[] }) =>
			createKitchenDraftFn({
				data: { kitchenId, title, notes, selections },
			}),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.kitchenDraft.listAll() })
			toast.success(`Previsão "${data?.title}" criada!`)
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useUpdateKitchenDraft() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ draftId, updates, selections }: { draftId: string; updates: { title?: string; notes?: string | null }; selections?: TemplateSelection[] }) =>
			updateKitchenDraftFn({
				data: { draftId, updates, selections },
			}),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.kitchenDraft.all() })
			toast.success(`Previsão "${data?.title}" atualizada!`)
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useSendKitchenDraft() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (draftId: string) => sendKitchenDraftFn({ data: { draftId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.kitchenDraft.all() })
			toast.success("Previsão enviada à unidade!")
		},
		onError: (error) => toast.error(error.message),
	})
}

export function useDeleteKitchenDraft() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (draftId: string) => deleteKitchenDraftFn({ data: { draftId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.kitchenDraft.listAll() })
			toast.success("Previsão removida.")
		},
		onError: (error) => toast.error(error.message),
	})
}

/**
 * A unidade importou a previsão num anexo: registra a importação e, na primeira, a previsão passa
 * a "Recebida pela unidade" do lado da cozinha.
 */
export function useRecordDraftImport(kitchenId: number) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: { draftId: string; listId: string }) => recordKitchenDraftImportFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.kitchenDraft.pending(kitchenId) })
			queryClient.invalidateQueries({ queryKey: queryKeys.kitchenDraft.list(kitchenId) })
		},
		onError: (error) => toast.error(`A previsão foi importada, mas o retorno à cozinha não foi registrado: ${error.message}`),
	})
}
