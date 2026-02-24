// hooks/usePresenceManagement.ts
// Uses centralized types from @/types/domain as per design system guidelines.

import type { PostgrestError } from "@supabase/supabase-js"
import {
	type UseMutationResult,
	type UseQueryResult,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useCallback } from "react"
import { toast } from "sonner"
import {
	deletePresenceFn,
	fetchForecastsFn,
	fetchPresencesFn,
	insertPresenceFn,
} from "@/server/presence.fn"
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

/**
 * Custom error thrown when a unit/mess hall code is required but not provided.
 */
class UnitRequiredError extends Error {
	constructor() {
		super("unit_required")
		this.name = "UnitRequiredError"
	}
}

/**
 * Type guard to check if an error is a PostgrestError.
 * @param e - Unknown error object
 * @returns True if the error is a PostgrestError
 */
const isPostgrestError = (e: unknown): e is PostgrestError => {
	return (
		typeof e === "object" &&
		e !== null &&
		"code" in e &&
		typeof (e as Record<string, unknown>).code === "string"
	)
}

/**
 * Union type for mutation errors.
 */
type MutationError = UnitRequiredError | PostgrestError

// ============================================================================
// QUERY KEYS
// ============================================================================
const presenceKeys = {
	all: ["presences"] as const,
	list: (date: string, meal: MealKey, unit: string) =>
		[...presenceKeys.all, date, meal, unit] as const,
	confirm: (date: string, meal: MealKey, unit: string) =>
		["confirmPresence", date, meal, unit] as const,
	remove: (date: string, meal: MealKey, unit: string) =>
		["removePresence", date, meal, unit] as const,
} as const

// ============================================================================
// VALIDATION
// ============================================================================
const isValidFilters = (filters: FiscalFilters): boolean => {
	return Boolean(filters.date && filters.meal && filters.unit)
}

// ============================================================================
// ERROR HANDLERS
// ============================================================================
const handleConfirmPresenceError = (error: unknown): void => {
	if (error instanceof UnitRequiredError) {
		toast.error("Selecione o rancho", {
			description: "É necessário informar a unidade (rancho).",
		})
		return
	}

	// Server function forwards error code via message pattern "code:23505"
	if (
		isPostgrestError(error) &&
		(error.code === "23505" || (error instanceof Error && error.message.includes("23505")))
	) {
		toast.info("Já registrado", {
			description: "Este militar já foi marcado presente.",
		})
		return
	}

	console.error("Falha ao salvar decisão:", error)
	toast.error("Erro", {
		description: "Falha ao salvar decisão.",
	})
}

const handleRemovePresenceError = (error: unknown): void => {
	console.error("Não foi possível excluir:", error)
	toast.error("Erro", {
		description: "Não foi possível excluir.",
	})
}

/**
 * Custom hook for managing meal presences with real-time queries.
 *
 * @remarks
 * This hook provides functionality to:
 * - Query presence records for a specific date, meal, and unit
 * - Fetch forecast data for users with presence records
 * - Confirm new presences with optimistic updates
 * - Remove existing presence records
 *
 * All mutations automatically invalidate and refetch the presence list.
 * Toast notifications are shown for all user actions.
 *
 * @param filters - Query filters (date, meal, unit code)
 * @returns UsePresenceManagementReturn object with state and mutation methods
 *
 * @example
 * ```tsx
 * const filters = { date: '2025-12-03', meal: 'almoco', unit: 'RANCHO_01' };
 * const {
 *   presences,
 *   forecastMap,
 *   isLoading,
 *   confirmPresence,
 *   removePresence,
 * } = usePresenceManagement(filters);
 *
 * // Confirm a user's presence
 * await confirmPresence('user-uuid-123', true);
 *
 * // Remove a presence record
 * await removePresence(presences[0]);
 * ```
 */
export function usePresenceManagement(filters: FiscalFilters): UsePresenceManagementReturn {
	const queryClient = useQueryClient()
	const isValid = isValidFilters(filters)

	// ============================================================================
	// QUERY: Fetch Presences & Forecasts
	// ============================================================================
	const presencesQuery: UseQueryResult<QueryResult, PostgrestError> = useQuery<
		QueryResult,
		PostgrestError
	>({
		queryKey: presenceKeys.list(filters.date, filters.meal, filters.unit),
		queryFn: async (): Promise<QueryResult> => {
			const presences = await fetchPresencesFn({
				data: { date: filters.date, meal: filters.meal, unit: filters.unit },
			})

			const userIds = Array.from(new Set(presences.map((p) => p.user_id)))
			const forecastMap = await fetchForecastsFn({
				data: { date: filters.date, meal: filters.meal, unit: filters.unit, userIds },
			})

			return { presences, forecastMap }
		},
		enabled: isValid,
		refetchOnWindowFocus: false,
		refetchOnMount: false,
		retry: 1,
		staleTime: 2 * 60 * 1000, // 2 minutos
		gcTime: 5 * 60 * 1000, // 5 minutos
		placeholderData: { presences: [], forecastMap: {} },
	})

	// ============================================================================
	// MUTATION: Confirm Presence
	// ============================================================================
	const confirmPresenceMutation: UseMutationResult<
		ConfirmPresenceResult,
		MutationError,
		ConfirmPresenceParams
	> = useMutation<ConfirmPresenceResult, MutationError, ConfirmPresenceParams>({
		mutationKey: presenceKeys.confirm(filters.date, filters.meal, filters.unit),
		mutationFn: async (params): Promise<ConfirmPresenceResult> => {
			if (!params.willEnter) {
				toast.info("Registro atualizado", {
					description: "Decisão registrada. Militar não entrará para a refeição.",
				})
				return { skipped: true }
			}

			if (!filters.unit) throw new UnitRequiredError()

			await insertPresenceFn({
				data: {
					user_id: params.uuid,
					date: filters.date,
					meal: filters.meal,
					unit_code: filters.unit,
				},
			})

			toast.success("Presença registrada", {
				description: `UUID ${params.uuid} marcado.`,
			})
			return { skipped: false }
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: presenceKeys.list(filters.date, filters.meal, filters.unit),
			})
		},
		onError: handleConfirmPresenceError,
	})

	// ============================================================================
	// MUTATION: Remove Presence
	// ============================================================================
	const removePresenceMutation: UseMutationResult<void, PostgrestError, FiscalPresenceRecord> =
		useMutation<void, PostgrestError, FiscalPresenceRecord>({
			mutationKey: presenceKeys.remove(filters.date, filters.meal, filters.unit),
			mutationFn: async (row): Promise<void> => {
				await deletePresenceFn({ data: { id: row.id } })

				toast.success("Excluído", {
					description: "Registro removido.",
				})
			},
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: presenceKeys.list(filters.date, filters.meal, filters.unit),
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

	// ============================================================================
	// RETURN
	// ============================================================================
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
