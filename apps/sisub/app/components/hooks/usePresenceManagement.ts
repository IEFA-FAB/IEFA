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
  unit: string;
}

interface PrevisaoRow {
  user_id: string;
  vai_comer: boolean;
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
// SUPABASE OPERATIONS
// ============================================================================
const fetchPresences = async (
  filters: FiscalFilters
): Promise<PresenceRecord[]> => {
  const { data, error } = await supabase
    .from("rancho_presencas")
    .select("id, user_id, date, meal, unidade, created_at")
    .eq("date", filters.date)
    .eq("meal", filters.meal)
    .eq("unidade", filters.unit)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar presenças:", error);
    toast.error("Erro", {
      description: "Não foi possível carregar as presenças.",
    });
    throw error;
  }

  return data ?? [];
};

const fetchForecasts = async (
  filters: FiscalFilters,
  userIds: string[]
): Promise<ForecastMap> => {
  if (userIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("rancho_previsoes")
    .select("user_id, vai_comer")
    .eq("data", filters.date)
    .eq("refeicao", filters.meal)
    .eq("unidade", filters.unit)
    .in("user_id", userIds);

  if (error) {
    console.warn("Falha ao buscar previsões:", error);
    return {};
  }

  const forecastMap: ForecastMap = {};
  (data ?? []).forEach((row: PrevisaoRow) => {
    forecastMap[row.user_id] = Boolean(row.vai_comer);
  });

  return forecastMap;
};

const insertPresence = async (
  params: ConfirmPresenceParams,
  filters: FiscalFilters
): Promise<void> => {
  if (!filters.unit) {
    throw new UnitRequiredError();
  }

  const { error } = await supabase.from("rancho_presencas").insert({
    user_id: params.uuid,
    date: filters.date,
    meal: filters.meal,
    unidade: filters.unit,
  });

  if (error) {
    throw error;
  }
};

const deletePresence = async (presenceId: string): Promise<void> => {
  const { error } = await supabase
    .from("rancho_presencas")
    .delete()
    .eq("id", presenceId);

  if (error) {
    throw error;
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
    toast.error("Selecione a OM", {
      description: "É necessário informar a unidade.",
    });
    return;
  }

  const pgError = error as PostgrestError | undefined;

  if (pgError?.code === "23505") {
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
  confirmPresence: (uuid: string, willEnter: boolean) => Promise<void>;
  removePresence: (row: PresenceRecord) => Promise<void>;
}

export function usePresenceManagement(
  filters: FiscalFilters
): UsePresenceManagementReturn {
  const queryClient = useQueryClient();
  const isValid = isValidFilters(filters);

  // ============================================================================
  // QUERY: Fetch Presences & Forecasts
  // ============================================================================
  const presencesQuery: UseQueryResult<QueryResult, Error> = useQuery({
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
    ConfirmPresenceResult | void,
    Error,
    ConfirmPresenceParams
  > = useMutation({
    mutationKey: presenceKeys.confirm(filters.date, filters.meal, filters.unit),
    mutationFn: async (
      params: ConfirmPresenceParams
    ): Promise<ConfirmPresenceResult | void> => {
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
  const removePresenceMutation: UseMutationResult<void, Error, PresenceRecord> =
    useMutation({
      mutationKey: presenceKeys.remove(
        filters.date,
        filters.meal,
        filters.unit
      ),
      mutationFn: async (row: PresenceRecord): Promise<void> => {
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
    async (uuid: string, willEnter: boolean): Promise<void> => {
      await confirmPresenceMutation.mutateAsync({ uuid, willEnter });
    },
    [confirmPresenceMutation]
  );

  const removePresence = useCallback(
    async (row: PresenceRecord): Promise<void> => {
      await removePresenceMutation.mutateAsync(row);
    },
    [removePresenceMutation]
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
