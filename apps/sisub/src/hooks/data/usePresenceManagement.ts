// hooks/usePresenceManagement.ts

import type { PostgrestError } from "@supabase/supabase-js"
import { type UseMutationResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import { deletePresenceFn, fetchArranchamentoMapFn, fetchPresencesFn, insertPresenceFn } from "@/server/presence.fn"
import type {
	ConfirmPresenceParams,
	ConfirmPresenceResult,
	FiscalFilters,
	FiscalPresenceRecord,
	QueryResult,
	UsePresenceManagementReturn,
} from "@/types/domain/presence"

// ============================================================================
// INTERNAL TYPES & ERROR CLASSES
// ============================================================================

class UnitRequiredError extends Error {
	constructor() {
		super("unit_required")
		this.name = "UnitRequiredError"
	}
}

type MutationError = UnitRequiredError | PostgrestError

// ============================================================================
// VALIDATION
// ============================================================================
const isValidFilters = (filters: FiscalFilters): boolean => {
	return Boolean(filters.date && filters.meal && filters.messHallId)
}

// ============================================================================
// ERROR HANDLERS
// ============================================================================
const handleConfirmPresenceError = (error: unknown): void => {
	if (error instanceof UnitRequiredError) {
		toast.error("Refeitório não identificado", {
			description: "O refeitório não foi encontrado.",
		})
		return
	}

	toast.error("Erro", { description: "Falha ao salvar decisão." })
}

const handleRemovePresenceError = (_error: unknown): void => {
	toast.error("Erro", { description: "Não foi possível excluir." })
}

export function usePresenceManagement(filters: FiscalFilters): UsePresenceManagementReturn {
	const queryClient = useQueryClient()
	const isValid = isValidFilters(filters)

	// ============================================================================
	// QUERY: Fetch Presences & Arranchamentos
	// ============================================================================
	const {
		data: presencesData,
		isLoading: presencesLoading,
		isFetching: presencesFetching,
	} = useQuery<QueryResult, PostgrestError>({
		queryKey: queryKeys.presences.list(filters.date, filters.meal, filters.messHallId),
		queryFn: async (): Promise<QueryResult> => {
			const presences = await fetchPresencesFn({
				data: { date: filters.date, meal: filters.meal, messHallId: filters.messHallId },
			})

			const userIds = Array.from(new Set(presences.map((p) => p.user_id)))
			const arranchamentoMap = await fetchArranchamentoMapFn({
				data: {
					date: filters.date,
					meal: filters.meal,
					messHallId: filters.messHallId,
					userIds,
				},
			})

			return { presences, arranchamentoMap }
		},
		enabled: isValid,
		refetchOnWindowFocus: false,
		refetchOnMount: false,
		retry: 1,
		staleTime: 2 * 60 * 1000,
		gcTime: 5 * 60 * 1000,
		placeholderData: { presences: [], arranchamentoMap: {} },
	})

	// ============================================================================
	// MUTATION: Confirm Presence
	// ============================================================================
	const confirmPresenceMutation: UseMutationResult<ConfirmPresenceResult, MutationError, ConfirmPresenceParams> = useMutation<
		ConfirmPresenceResult,
		MutationError,
		ConfirmPresenceParams
	>({
		mutationKey: queryKeys.presences.confirm(filters.date, filters.meal, filters.messHallId),
		mutationFn: async (params): Promise<ConfirmPresenceResult> => {
			if (!params.willEnter) {
				toast.info("Registro atualizado", {
					description: "Decisão registrada. Militar não entrará para a refeição.",
				})
				return { status: "skipped" }
			}

			// Grava onde o crachá foi lido, não nos filtros de agora: o fiscal pode ter trocado a
			// refeição enquanto o diálogo estava aberto.
			const target = params.scope ?? filters
			if (!target.messHallId) throw new UnitRequiredError()

			const outcome = await insertPresenceFn({
				data: {
					user_id: params.uuid,
					date: target.date,
					meal: target.meal,
					messHallId: target.messHallId,
				},
			})

			// Duplicidade chega como resultado: o transporte da server fn não leva o código do erro.
			if (outcome.status === "duplicate") {
				toast.info("Já registrado", {
					description: "Este militar já foi marcado presente.",
				})
				return { status: "duplicate" }
			}

			toast.success("Presença registrada", {
				description: `UUID ${params.uuid} marcado.`,
			})
			return { status: "inserted" }
		},
		onSuccess: (_result, params) => {
			const target = params.scope ?? filters
			queryClient.invalidateQueries({
				queryKey: queryKeys.presences.list(target.date, target.meal, target.messHallId),
			})
		},
		onError: handleConfirmPresenceError,
	})

	// ============================================================================
	// MUTATION: Remove Presence
	// ============================================================================
	const removePresenceMutation: UseMutationResult<void, PostgrestError, FiscalPresenceRecord> = useMutation<void, PostgrestError, FiscalPresenceRecord>({
		mutationKey: queryKeys.presences.remove(filters.date, filters.meal, filters.messHallId),
		mutationFn: async (row): Promise<void> => {
			await deletePresenceFn({ data: { id: row.id } })
			toast.success("Excluído", { description: "Registro removido." })
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.presences.list(filters.date, filters.meal, filters.messHallId),
			})
		},
		onError: handleRemovePresenceError,
	})

	// ============================================================================
	// CALLBACKS
	// ============================================================================
	const confirmPresence = useCallback(
		async (uuid: string, willEnter: boolean, scope?: FiscalFilters): Promise<ConfirmPresenceResult> => {
			return await confirmPresenceMutation.mutateAsync({ uuid, willEnter, scope })
		},
		[confirmPresenceMutation]
	)

	const removePresence = useCallback(
		async (row: FiscalPresenceRecord): Promise<void> => {
			await removePresenceMutation.mutateAsync(row)
		},
		[removePresenceMutation]
	)

	return {
		presences: presencesData?.presences ?? [],
		arranchamentoMap: presencesData?.arranchamentoMap ?? {},
		isLoading: presencesLoading || presencesFetching,
		isConfirming: confirmPresenceMutation.isPending,
		isRemoving: removePresenceMutation.isPending,
		confirmPresence,
		removePresence,
	}
}
