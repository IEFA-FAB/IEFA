import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "@/lib/query-keys"
import {
	createKitchenDraftFn,
	deleteKitchenDraftFn,
	fetchKitchenDraftsFn,
	fetchPendingDraftFn,
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
 * Busca o rascunho com status 'sent' mais recente da cozinha.
 * Usado pelo gestor da unidade para importar sugestões da cozinha no wizard.
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
			toast.success(`Rascunho "${data?.title}" criado!`)
		},
		onError: (error) => toast.error(`Erro ao criar rascunho: ${error.message}`),
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
			toast.success(`Rascunho "${data?.title}" atualizado!`)
		},
		onError: (error) => toast.error(`Erro ao atualizar rascunho: ${error.message}`),
	})
}

export function useSendKitchenDraft() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (draftId: string) => sendKitchenDraftFn({ data: { draftId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.kitchenDraft.all() })
			toast.success("Rascunho enviado para a gestão da unidade!")
		},
		onError: (error) => toast.error(`Erro ao enviar rascunho: ${error.message}`),
	})
}

export function useDeleteKitchenDraft() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (draftId: string) => deleteKitchenDraftFn({ data: { draftId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.kitchenDraft.listAll() })
			toast.success("Rascunho removido.")
		},
		onError: (error) => toast.error(`Erro ao remover rascunho: ${error.message}`),
	})
}
