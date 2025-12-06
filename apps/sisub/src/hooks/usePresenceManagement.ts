// hooks/usePresenceManagement.ts
// Uses centralized types from @/types/domain as per design system guidelines.

import type { PostgrestError } from "@supabase/supabase-js";
import {
	type UseMutationResult,
	type UseQueryResult,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import type {
	ConfirmPresenceParams,
	ConfirmPresenceResult,
	FiscalFilters,
	ForecastMap,
	ForecastRow,
	QueryResult,
	UsePresenceManagementReturn,
} from "@/types/domain";
import type { MealKey, PresenceRecord } from "@/utils/FiscalUtils";
import supabase from "@/utils/supabase";

// ============================================================================
// INTERNAL TYPES & ERROR CLASSES
// ============================================================================

/**
 * Custom error thrown when a unit/mess hall code is required but not provided.
 */
class UnitRequiredError extends Error {
	constructor() {
		super("unit_required");
		this.name = "UnitRequiredError";
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
		typeof (e as any).code === "string"
	);
};

/**
 * Union type for mutation errors.
 */
type MutationError = UnitRequiredError | PostgrestError;

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
} as const;

// ============================================================================
// HELPERS (code -> mess_hall_id com cache)
// ============================================================================
const messHallIdCache = new Map<string, number>();

/**
 * Helper function to resolve a mess hall code to its database ID.
 * Results are cached to minimize database queries.
 *
 * @param code - Mess hall code to lookup
 * @returns Mess hall ID if found, undefined otherwise
 */
async function getMessHallIdByCode(code: string): Promise<number | undefined> {
	if (!code) return undefined;
	const cached = messHallIdCache.get(code);
	if (cached) return cached;

	const { data, error } = await supabase
		.schema("sisub")
		.from("mess_halls")
		.select("id")
		.eq("code", code)
		.maybeSingle();

	if (error) {
		console.warn("Falha ao buscar mess_hall_id:", error);
		return undefined;
	}
	const id = data?.id as number | undefined;
	if (id) messHallIdCache.set(code, id);
	return id;
}

// ============================================================================
// SUPABASE OPERATIONS
// ============================================================================

/**
 * Fetches meal presence records for the given filters.
 * Joins with user data to include display names.
 *
 * @param filters - Query filters (date, meal, unit code)
 * @returns Array of presence records with user information
 */
const fetchPresences = async (
	filters: FiscalFilters,
): Promise<PresenceRecord[]> => {
	if (!filters.unit) return [];

	// 1) Mapear code -> mess_hall_id
	const messHallId = await getMessHallIdByCode(filters.unit);
	if (!messHallId) {
		console.warn(`Código de rancho não encontrado: ${filters.unit}`);
		return [];
	}

	// 2) Buscar presenças na VIEW com display_name
	type PresenceRowWithUser = {
		id: string;
		user_id: string;
		date: string;
		meal: MealKey;
		created_at: string;
		mess_hall_id: number;
		display_name: string | null;
	};

	const { data, error } = await supabase
		.from("v_meal_presences_with_user")
		.select("id, user_id, date, meal, created_at, mess_hall_id, display_name")
		.eq("date", filters.date)
		.eq("meal", filters.meal)
		.eq("mess_hall_id", messHallId)
		.order("created_at", { ascending: false })
		.returns<PresenceRowWithUser[]>();

	if (error) {
		console.error("Erro ao buscar presenças:", error);
		toast.error("Erro", {
			description: "Não foi possível carregar as presenças.",
		});
		throw error;
	}

	const rows = data ?? [];

	// 3) Mapear para PresenceRecord esperado pela UI (mantendo unidade = code)
	//    Carregamos display_name como campo extra (permanece disponível em runtime).
	const mapped: PresenceRecord[] = rows.map((r) => {
		const base: PresenceRecord = {
			id: r.id,
			user_id: r.user_id,
			date: r.date,
			meal: r.meal,
			created_at: r.created_at,
			unidade: filters.unit,
		};
		// Anexa display_name sem quebrar o tipo de retorno:
		return Object.assign(base, { display_name: r.display_name ?? null });
	});

	return mapped;
};

/**
 * Fetches meal forecast data for a list of users.
 * Maps forecast information to a user ID -> forecast boolean map.
 *
 * @param filters - Query filters (date, meal, unit code)
 * @param userIds - Array of user IDs to fetch forecasts for
 * @returns Map of user IDs to forecast status
 */
const fetchForecasts = async (
	filters: FiscalFilters,
	userIds: string[],
): Promise<ForecastMap> => {
	if (userIds.length === 0) return {};
	if (!filters.unit) return {};

	const messHallId = await getMessHallIdByCode(filters.unit);
	if (!messHallId) {
		console.warn(`Código de rancho não encontrado: ${filters.unit}`);
		return {};
	}

	// Previsões na nova tabela
	const { data, error } = await supabase
		.schema("sisub")
		.from("meal_forecasts")
		.select("user_id, will_eat")
		.eq("date", filters.date)
		.eq("meal", filters.meal)
		.eq("mess_hall_id", messHallId)
		.in("user_id", userIds)
		.returns<ForecastRow[]>();

	if (error) {
		console.warn("Falha ao buscar previsões:", error);
		return {};
	}

	const forecastMap: ForecastMap = {};
	(data ?? []).forEach((row) => {
		forecastMap[row.user_id] = Boolean(row.will_eat);
	});

	return forecastMap;
};

/**
 * Inserts a new presence record for a user.
 *
 * @param params - Presence parameters (uuid, willEnter flag)
 * @param filters - Query filters to determine meal and date
 * @throws {UnitRequiredError} If unit code is missing
 * @throws {PostgrestError} If database operation fails
 */
const insertPresence = async (
	params: ConfirmPresenceParams,
	filters: FiscalFilters,
): Promise<void> => {
	if (!filters.unit) {
		throw new UnitRequiredError();
	}

	const messHallId = await getMessHallIdByCode(filters.unit);
	if (!messHallId) {
		throw new UnitRequiredError(); // ou um erro mais específico
	}

	const { error } = await supabase
		.schema("sisub")
		.from("meal_presences")
		.insert({
			user_id: params.uuid,
			date: filters.date,
			meal: filters.meal,
			mess_hall_id: messHallId,
		});

	if (error) {
		throw error; // PostgrestError
	}
};

/**
 * Deletes a presence record by its ID.
 *
 * @param presenceId - ID of the presence record to delete
 * @throws {PostgrestError} If database operation fails
 */
const deletePresence = async (presenceId: string): Promise<void> => {
	const { error } = await supabase
		.schema("sisub")
		.from("meal_presences")
		.delete()
		.eq("id", presenceId);

	if (error) {
		throw error; // PostgrestError
	}
};

// ============================================================================
// VALIDATION
// ============================================================================
const isValidFilters = (filters: FiscalFilters): boolean => {
	return Boolean(filters.date && filters.meal && filters.unit);
};

// ============================================================================
// ERROR HANDLERS
// ============================================================================
const handleConfirmPresenceError = (error: unknown): void => {
	if (error instanceof UnitRequiredError) {
		toast.error("Selecione o rancho", {
			description: "É necessário informar a unidade (rancho).",
		});
		return;
	}

	if (isPostgrestError(error) && error.code === "23505") {
		toast.info("Já registrado", {
			description: "Este militar já foi marcado presente.",
		});
		return;
	}

	console.error("Falha ao salvar decisão:", error);
	toast.error("Erro", {
		description: "Falha ao salvar decisão.",
	});
};

const handleRemovePresenceError = (error: unknown): void => {
	console.error("Não foi possível excluir:", error);
	toast.error("Erro", {
		description: "Não foi possível excluir.",
	});
};

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
export function usePresenceManagement(
	filters: FiscalFilters,
): UsePresenceManagementReturn {
	const queryClient = useQueryClient();
	const isValid = isValidFilters(filters);

	// ============================================================================
	// QUERY: Fetch Presences & Forecasts
	// ============================================================================
	const presencesQuery: UseQueryResult<QueryResult, PostgrestError> = useQuery<
		QueryResult,
		PostgrestError
	>({
		queryKey: presenceKeys.list(filters.date, filters.meal, filters.unit),
		queryFn: async (): Promise<QueryResult> => {
			const presences = await fetchPresences(filters);

			// Buscar previsões apenas dos usuários presentes
			const userIds = Array.from(new Set(presences.map((p) => p.user_id)));
			const forecastMap = await fetchForecasts(filters, userIds);

			return { presences, forecastMap };
		},
		enabled: isValid,
		refetchOnWindowFocus: false,
		refetchOnMount: false,
		retry: 1,
		staleTime: 2 * 60 * 1000, // 2 minutos
		gcTime: 5 * 60 * 1000, // 5 minutos
		placeholderData: { presences: [], forecastMap: {} },
	});

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
					description:
						"Decisão registrada. Militar não entrará para a refeição.",
				});
				return { skipped: true };
			}

			await insertPresence(params, filters);

			toast.success("Presença registrada", {
				description: `UUID ${params.uuid} marcado.`,
			});
			return { skipped: false };
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: presenceKeys.list(filters.date, filters.meal, filters.unit),
			});
		},
		onError: handleConfirmPresenceError,
	});

	// ============================================================================
	// MUTATION: Remove Presence
	// ============================================================================
	const removePresenceMutation: UseMutationResult<
		void,
		PostgrestError,
		PresenceRecord
	> = useMutation<void, PostgrestError, PresenceRecord>({
		mutationKey: presenceKeys.remove(filters.date, filters.meal, filters.unit),
		mutationFn: async (row): Promise<void> => {
			await deletePresence(row.id);

			toast.success("Excluído", {
				description: "Registro removido.",
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: presenceKeys.list(filters.date, filters.meal, filters.unit),
			});
		},
		onError: handleRemovePresenceError,
	});

	// ============================================================================
	// CALLBACKS
	// ============================================================================
	const confirmPresence = useCallback(
		async (
			uuid: string,
			willEnter: boolean,
		): Promise<ConfirmPresenceResult> => {
			return await confirmPresenceMutation.mutateAsync({ uuid, willEnter });
		},
		[confirmPresenceMutation],
	);

	const removePresence = useCallback(
		async (row: PresenceRecord): Promise<void> => {
			await removePresenceMutation.mutateAsync(row);
		},
		[removePresenceMutation],
	);

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
	};
}
