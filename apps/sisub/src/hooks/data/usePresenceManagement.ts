// hooks/usePresenceManagement.ts

import type { PostgrestError } from "@supabase/supabase-js"
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { toast } from "sonner"
import { deletePresenceFn, fetchForecastsFn, fetchPresencesFn, insertPresenceFn } from "@/server/presence.fn"
import type { MealKey } from "@/types/domain/meal"
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

const isPostgrestError = (e: unknown): e is PostgrestError => {
	return typeof e === "object" && e !== null && "code" in e && typeof (e as Record<string, unknown>).code === "string"
}

type MutationError = UnitRequiredError | PostgrestError

// ============================================================================
// QUERY KEYS
// ============================================================================
const presenceKeys = {
	all: ["presences"] as const,
	list: (date: string, meal: MealKey, messHallId: number) => [...presenceKeys.all, date, meal, messHallId] as const,
	confirm: (date: string, meal: MealKey, messHallId: number) => ["confirmPresence", date, meal, messHallId] as const,
	remove: (date: string, meal: MealKey, messHallId: number) => ["removePresence", date, meal, messHallId] as const,
} as const

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
		toast.error("Rancho não identificado", {
			description: "O refeitório não foi encontrado.",
		})
		return
	}

	if (isPostgrestError(error) && (error.code === "23505" || (error instanceof Error && error.message.includes("23505")))) {
		toast.info("Já registrado", {
			description: "Este militar já foi marcado presente.",
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
	// QUERY: Fetch Presences & Forecasts
	// ============================================================================
	const presencesQuery: UseQueryResult<QueryResult, PostgrestError> = useQuery<QueryResult, PostgrestError>({
		queryKey: presenceKeys.list(filters.date, filters.meal, filters.messHallId),
		queryFn: async (): Promise<QueryResult> => {
			const presences = await fetchPresencesFn({
				data: { date: filters.date, meal: filters.meal, messHallId: filters.messHallId },
			})

			const userIds = Array.from(new Set(presences.map((p) => p.user_id)))
			const forecastMap = await fetchForecastsFn({
				data: {
					date: filters.date,
					meal: filters.meal,
					messHallId: filters.messHallId,
					userIds,
				},
			})

			return { presences, forecastMap }
		},
		enabled: isValid,
		refetchOnWindowFocus: false,
		refetchOnMount: false,
		retry: 1,
		staleTime: 2 * 60 * 1000,
		gcTime: 5 * 60 * 1000,
		placeholderData: { presences: [], forecastMap: {} },
	})

	// ============================================================================
	// MUTATION: Confirm Presence
	// ============================================================================
	const confirmPresenceMutation: UseMutationResult<ConfirmPresenceResult, MutationError, ConfirmPresenceParams> = useMutation<
		ConfirmPresenceResult,
		MutationError,
		ConfirmPresenceParams
	>({
		mutationKey: presenceKeys.confirm(filters.date, filters.meal, filters.messHallId),
		mutationFn: async (params): Promise<ConfirmPresenceResult> => {
			if (!params.willEnter) {
				toast.info("Registro atualizado", {
					description: "Decisão registrada. Militar não entrará para a refeição.",
				})
				return { skipped: true }
			}

			if (!filters.messHallId) throw new UnitRequiredError()

			await insertPresenceFn({
				data: {
					user_id: params.uuid,
					date: filters.date,
					meal: filters.meal,
					messHallId: filters.messHallId,
				},
			})

			toast.success("Presença registrada", {
				description: `UUID ${params.uuid} marcado.`,
			})
			return { skipped: false }
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: presenceKeys.list(filters.date, filters.meal, filters.messHallId),
			})
		},
		onError: handleConfirmPresenceError,
	})

	// ============================================================================
	// MUTATION: Remove Presence
	// ============================================================================
	const removePresenceMutation: UseMutationResult<void, PostgrestError, FiscalPresenceRecord> = useMutation<void, PostgrestError, FiscalPresenceRecord>({
		mutationKey: presenceKeys.remove(filters.date, filters.meal, filters.messHallId),
		mutationFn: async (row): Promise<void> => {
			await deletePresenceFn({ data: { id: row.id } })
			toast.success("Excluído", { description: "Registro removido." })
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: presenceKeys.list(filters.date, filters.meal, filters.messHallId),
			})
		},
		onError: handleRemovePresenceError,
	})

	// ============================================================================
	// CALLBACKS
	// ============================================================================
	const confirmPresence = useCallback(
		async (uuid: string, willEnter: boolean): Promise<ConfirmPresenceResult> => {
			return await confirmPresenceMutation.mutateAsync({ uuid, willEnter })
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
		presences: presencesQuery.data?.presences ?? [],
		forecastMap: presencesQuery.data?.forecastMap ?? {},
		isLoading: presencesQuery.isLoading || presencesQuery.isFetching,
		isConfirming: confirmPresenceMutation.isPending,
		isRemoving: removePresenceMutation.isPending,
		confirmPresence,
		removePresence,
	}
}
