// hooks/usePresenceManagement.ts
import { useCallback } from "react";
import {
    useQuery,
    useMutation,
    useQueryClient,
    type UseQueryResult,
    type UseMutationResult,
} from "@tanstack/react-query";
import supabase from "~/utils/supabase";
import { toast } from "sonner";
import type { PresenceRecord, MealKey } from "~/utils/FiscalUtils";
import type { PostgrestError } from "@supabase/supabase-js";

// ============================================================================
// TYPES
// ============================================================================
export interface FiscalFilters {
    date: string;
    meal: MealKey;
    unit: string; // mess hall code
}

interface ForecastRow {
    user_id: string;
    will_eat: boolean | null;
}

interface PresenceRow {
    id: string;
    user_id: string;
    date: string;
    meal: MealKey;
    created_at: string;
    mess_hall_id: number;
}

interface QueryResult {
    presences: PresenceRecord[];
    forecastMap: Record<string, boolean>;
}

interface ConfirmPresenceParams {
    uuid: string;
    willEnter: boolean;
}

interface ConfirmPresenceResult {
    skipped: boolean;
}

type ForecastMap = Record<string, boolean>;

// Custom error types
class UnitRequiredError extends Error {
    constructor() {
        super("unit_required");
        this.name = "UnitRequiredError";
    }
}

// Caso queira um type guard para PostgrestError (opcional)
const isPostgrestError = (e: unknown): e is PostgrestError => {
    return typeof e === "object" && e !== null && "code" in e && typeof (e as any).code === "string";
};

// Erro das mutations (evita Error genérico)
type MutationError = UnitRequiredError | PostgrestError;

// ============================================================================
// QUERY KEYS
// ============================================================================
const presenceKeys = {
    all: ["presences"] as const,
    list: (date: string, meal: MealKey, unit: string) => [...presenceKeys.all, date, meal, unit] as const,
    confirm: (date: string, meal: MealKey, unit: string) => ["confirmPresence", date, meal, unit] as const,
    remove: (date: string, meal: MealKey, unit: string) => ["removePresence", date, meal, unit] as const,
} as const;

// ============================================================================
// HELPERS (code -> mess_hall_id com cache)
// ============================================================================
const messHallIdCache = new Map<string, number>();

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

const fetchPresences = async (filters: FiscalFilters): Promise<PresenceRecord[]> => {
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

const fetchForecasts = async (filters: FiscalFilters, userIds: string[]): Promise<ForecastMap> => {
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

const insertPresence = async (params: ConfirmPresenceParams, filters: FiscalFilters): Promise<void> => {
    if (!filters.unit) {
        throw new UnitRequiredError();
    }

    const messHallId = await getMessHallIdByCode(filters.unit);
    if (!messHallId) {
        throw new UnitRequiredError(); // ou um erro mais específico
    }

    const { error } = await supabase.schema("sisub").from("meal_presences").insert({
        user_id: params.uuid,
        date: filters.date,
        meal: filters.meal,
        mess_hall_id: messHallId,
    });

    if (error) {
        throw error; // PostgrestError
    }
};

const deletePresence = async (presenceId: string): Promise<void> => {
    const { error } = await supabase.schema("sisub").from("meal_presences").delete().eq("id", presenceId);

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

// ============================================================================
// HOOK
// ============================================================================
export interface UsePresenceManagementReturn {
    presences: PresenceRecord[];
    forecastMap: ForecastMap;
    isLoading: boolean;
    isConfirming: boolean;
    isRemoving: boolean;
    confirmPresence: (uuid: string, willEnter: boolean) => Promise<ConfirmPresenceResult>;
    removePresence: (row: PresenceRecord) => Promise<void>;
}

export function usePresenceManagement(filters: FiscalFilters): UsePresenceManagementReturn {
    const queryClient = useQueryClient();
    const isValid = isValidFilters(filters);

    // ============================================================================
    // QUERY: Fetch Presences & Forecasts
    // ============================================================================
    const presencesQuery: UseQueryResult<QueryResult, PostgrestError> = useQuery<QueryResult, PostgrestError>({
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
    const confirmPresenceMutation: UseMutationResult<ConfirmPresenceResult, MutationError, ConfirmPresenceParams> =
        useMutation<ConfirmPresenceResult, MutationError, ConfirmPresenceParams>({
            mutationKey: presenceKeys.confirm(filters.date, filters.meal, filters.unit),
            mutationFn: async (params): Promise<ConfirmPresenceResult> => {
                if (!params.willEnter) {
                    toast.info("Registro atualizado", {
                        description: "Decisão registrada. Militar não entrará para a refeição.",
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
    const removePresenceMutation: UseMutationResult<void, PostgrestError, PresenceRecord> = useMutation<
        void,
        PostgrestError,
        PresenceRecord
    >({
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
        async (uuid: string, willEnter: boolean): Promise<ConfirmPresenceResult> => {
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
