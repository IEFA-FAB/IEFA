// hooks/useMealForecast.ts
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@iefa/auth";
import supabase from "~/utils/supabase";

// Business defaults and timings
const DEFAULT_MESS_HALL_CODE = "DIRAD - DIRAD"; // keep your existing default, now named in English
const DAYS_TO_SHOW = 30;
const AUTO_SAVE_DELAY = 1500;
const SUCCESS_MESSAGE_DURATION = 3000;

// Meals structure (English)
export interface DayMeals {
  cafe: boolean;
  almoco: boolean;
  janta: boolean;
  ceia: boolean;
}

export interface SelectionsByDate {
  [date: string]: DayMeals;
}

// Selected Mess Hall by date (stores mess hall code)
export interface MessHallByDate {
  [date: string]: string;
}

// Change to persist
export interface PendingChange {
  date: string;
  meal: keyof DayMeals;
  value: boolean;
  messHallCode: string; // was 'unidade' in PT
}

export interface MealForecastHook {
  success: string;
  error: string;
  isLoading: boolean; // initial load
  isRefetching: boolean; // background refetch
  pendingChanges: PendingChange[];
  isSavingBatch: boolean;
  selections: SelectionsByDate;
  dayMessHalls: MessHallByDate;
  defaultMessHallCode: string;
  dates: string[];
  todayString: string;
  setSuccess: (msg: string) => void;
  setError: (msg: string) => void;
  setPendingChanges: React.Dispatch<React.SetStateAction<PendingChange[]>>;
  setSelections: React.Dispatch<React.SetStateAction<SelectionsByDate>>;
  setDayMessHalls: React.Dispatch<React.SetStateAction<MessHallByDate>>;
  setDefaultMessHallCode: (code: string) => void;
  loadExistingForecasts: () => Promise<void>;
  savePendingChanges: () => Promise<void>;
  clearMessages: () => void;
}

const createEmptyDayMeals = (): DayMeals => ({
  cafe: false,
  almoco: false,
  janta: false,
  ceia: false,
});

/**
 * Format Date -> 'YYYY-MM-DD' in local timezone
 */
const toYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const generateDates = (days: number): string[] => {
  const dates: string[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(toYYYYMMDD(date));
  }
  return dates;
};

// Helpers (PT messages kept for UX continuity)
const pluralize = (count: number, singular: string, plural: string) =>
  count === 1 ? singular : plural;

const labelAlteracao = (n: number) => pluralize(n, "alteração", "alterações");
const labelSalva = (n: number) => pluralize(n, "salva", "salvas");
const labelFalhou = (n: number) => pluralize(n, "falhou", "falharam");
const labelOperacao = (n: number) => pluralize(n, "operação", "operações");

export const useMealForecast = (): MealForecastHook => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [isClient, setIsClient] = useState(false);

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveOperationRef = useRef<Promise<void> | null>(null);
  const hydratedOnceRef = useRef(false);

  const [success, setSuccessState] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [isSavingBatch, setIsSavingBatch] = useState<boolean>(false);
  const [selections, setSelections] = useState<SelectionsByDate>({});
  const [dayMessHalls, setDayMessHalls] = useState<MessHallByDate>({});
  const [defaultMessHallCode, setDefaultMessHallCode] = useState<string>(
    DEFAULT_MESS_HALL_CODE
  );

  // Stable dates and keys
  const dates = useMemo(() => generateDates(DAYS_TO_SHOW), []);
  const todayString = useMemo(() => toYYYYMMDD(new Date()), []);
  const queryKey = useMemo(
    () => ["mealForecasts", user?.id, dates[0], dates[dates.length - 1]],
    [user?.id, dates]
  );

  // Messages
  const clearMessages = useCallback(() => {
    setSuccessState("");
    setError("");
  }, []);

  const setSuccess = useCallback((msg: string) => {
    setSuccessState(msg);
    setError("");

    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }

    if (msg) {
      successTimerRef.current = setTimeout(() => {
        setSuccessState("");
      }, SUCCESS_MESSAGE_DURATION);
    }
  }, []);

  const setErrorWithClear = useCallback((msg: string) => {
    setError(msg);
    setSuccessState("");
  }, []);

  // Query: forecasts for period for user
  const {
    data: forecasts,
    isPending, // initial load
    isFetching, // any refetch
    refetch,
  } = useQuery({
    queryKey,
    enabled: isClient && !!user?.id,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    /* keepPreviousData: true, */
    // Supabase query keeps original (PT) column names
    queryFn: async () => {
      const { data, error: supabaseError } = await supabase
        .from("rancho_previsoes")
        .select("data, unidade, refeicao, vai_comer")
        .eq("user_id", user!.id)
        .gte("data", dates[0])
        .lte("data", dates[dates.length - 1])
        .order("data", { ascending: true });

      if (supabaseError) {
        throw supabaseError;
      }
      return data ?? [];
    },
  });

  // Hydrate selections and dayMessHalls from query with defensive defaults
  useEffect(() => {
    if (!user?.id) return;
    if (!forecasts) return;

    const canOverwrite = pendingChanges.length === 0 && !isSavingBatch;
    if (!hydratedOnceRef.current || canOverwrite) {
      const initialSelections: SelectionsByDate = {};
      const initialMessHalls: MessHallByDate = {};

      dates.forEach((date) => {
        initialSelections[date] = createEmptyDayMeals();
        initialMessHalls[date] = defaultMessHallCode;
      });

      forecasts.forEach((p: any) => {
        const { data, unidade, refeicao, vai_comer } = p;
        if (initialSelections[data] && refeicao in initialSelections[data]) {
          initialSelections[data][refeicao as keyof DayMeals] = !!vai_comer;
          // Here 'unidade' stores the mess hall code historically
          initialMessHalls[data] = unidade || defaultMessHallCode;
        }
      });

      setSelections(initialSelections);
      setDayMessHalls(initialMessHalls);
      hydratedOnceRef.current = true;
    }
  }, [
    user?.id,
    forecasts,
    dates,
    defaultMessHallCode,
    pendingChanges.length,
    isSavingBatch,
  ]);

  // Validate mess hall codes against sisub.mess_halls before saving
  const validateMessHallCodes = useCallback(
    async (codes: string[]): Promise<void> => {
      if (codes.length === 0) return;

      // Fetch unique codes and validate existence
      const uniqueCodes = Array.from(new Set(codes));
      const { data, error } = await supabase
        .schema("sisub")
        .from("mess_halls")
        .select("code")
        .in("code", uniqueCodes);

      if (error) throw error;

      const existing = new Set((data ?? []).map((r) => r.code));
      const missing = uniqueCodes.filter((c) => !existing.has(c));
      if (missing.length > 0) {
        throw new Error(
          `Os seguintes códigos de rancho são inválidos ou não existem: ${missing.join(
            ", "
          )}`
        );
      }
    },
    []
  );

  // Batch save with validation and conflict handling
  const savePendingChanges = useCallback(async (): Promise<void> => {
    if (!user?.id || pendingChanges.length === 0) return;

    // Avoid parallel saves
    if (saveOperationRef.current) {
      await saveOperationRef.current;
      return;
    }

    const saveOperation = async () => {
      setIsSavingBatch(true);
      setErrorWithClear("");

      try {
        const changesToSave = [...pendingChanges];

        // Pre-validate business rule: mess hall codes must exist in sisub.mess_halls
        const codesToValidate = changesToSave
          .filter((c) => c.value) // only for upserts
          .map((c) => c.messHallCode);
        await validateMessHallCodes(codesToValidate);

        // Group by date-meal to avoid duplicates
        const changesByKey = changesToSave.reduce(
          (acc, change) => {
            const key = `${change.date}-${change.meal}`;
            acc[key] = change;
            return acc;
          },
          {} as { [key: string]: PendingChange }
        );

        const results = await Promise.allSettled(
          Object.values(changesByKey).map(async (change) => {
            try {
              if (change.value) {
                // Upsert forecast (keep PT column names in the DB)
                const { error: upsertError } = await supabase
                  .from("rancho_previsoes")
                  .upsert(
                    {
                      data: change.date,
                      unidade: change.messHallCode, 
                      user_id: user.id,
                      refeicao: change.meal,
                      vai_comer: true,
                    },
                    {
                      onConflict: "user_id,data,refeicao",
                      ignoreDuplicates: false,
                    }
                  );

                if (upsertError) {
                  // Fallback: delete + insert
                  await supabase
                    .from("rancho_previsoes")
                    .delete()
                    .eq("user_id", user.id)
                    .eq("data", change.date)
                    .eq("refeicao", change.meal);

                  const { error: insertError } = await supabase
                    .from("rancho_previsoes")
                    .insert({
                      data: change.date,
                      unidade: change.messHallCode,
                      user_id: user.id,
                      refeicao: change.meal,
                      vai_comer: true,
                    });

                  if (insertError) throw insertError;
                }
              } else {
                // Delete forecast
                const { error: deleteError } = await supabase
                  .from("rancho_previsoes")
                  .delete()
                  .eq("user_id", user.id)
                  .eq("data", change.date)
                  .eq("refeicao", change.meal);

                if (
                  deleteError &&
                  !deleteError.message.includes("No rows deleted")
                ) {
                  throw deleteError;
                }
              }

              return {
                success: true,
                change,
                operation: change.value ? "upsert" : "delete",
              };
            } catch (err) {
              console.error(
                `Erro ao processar mudança para ${change.date}-${change.meal}:`,
                err
              );
              return {
                success: false,
                change,
                error: err instanceof Error ? err.message : "Erro desconhecido",
              };
            }
          })
        );

        const successful = results.filter(
          (r) => r.status === "fulfilled" && r.value.success
        ) as PromiseFulfilledResult<{
          success: boolean;
          change: PendingChange;
        }>[];

        const failed = results.filter(
          (r) =>
            r.status === "rejected" ||
            (r.status === "fulfilled" && !r.value.success)
        );

        if (failed.length === 0) {
          const n = changesToSave.length;
          setSuccess(`${n} ${labelAlteracao(n)} ${labelSalva(n)} com sucesso!`);

          setPendingChanges((prev) =>
            prev.filter(
              (change) =>
                !changesToSave.some(
                  (saved) =>
                    saved.date === change.date &&
                    saved.meal === change.meal &&
                    saved.value === change.value &&
                    saved.messHallCode === change.messHallCode
                )
            )
          );
        } else if (successful.length > 0) {
          const nOk = successful.length;
          const nFail = failed.length;

          setSuccess(
            `${nOk} ${labelAlteracao(nOk)} ${labelSalva(nOk)}. ${nFail} ${labelAlteracao(
              nFail
            )} ${labelFalhou(nFail)}.`
          );

          const successfulChanges = successful.map((r) => r.value.change);
          setPendingChanges((prev) =>
            prev.filter(
              (change) =>
                !successfulChanges.some(
                  (ok) =>
                    ok.date === change.date &&
                    ok.meal === change.meal &&
                    ok.value === change.value &&
                    ok.messHallCode === change.messHallCode
                )
            )
          );

          failed.forEach((result) => {
            if (result.status === "fulfilled") {
              console.error("Erro na operação:", result.value.error);
            } else {
              console.error("Promise rejeitada:", result.reason);
            }
          });
        } else {
          const errorMessages = failed
            .map((result) => {
              if (result.status === "fulfilled") {
                return (result as PromiseFulfilledResult<any>).value.error;
              } else {
                return (
                  (result as PromiseRejectedResult).reason?.message ||
                  "Erro desconhecido"
                );
              }
            })
            .join(", ");

          const count = changesToSave.length;
          if (count === 1) {
            throw new Error(
              `A ${labelOperacao(count)} ${labelFalhou(count)}: ${errorMessages}`
            );
          } else {
            throw new Error(
              `Todas as ${count} ${labelOperacao(count)} ${labelFalhou(count)}: ${errorMessages}`
            );
          }
        }

        // Background refresh
        queryClient.invalidateQueries({ queryKey });
      } catch (err) {
        console.error("Erro crítico ao salvar mudanças:", err);
        setErrorWithClear(
          err instanceof Error
            ? `Erro ao salvar ${labelAlteracao(1)}: ${err.message}`
            : "Erro ao salvar alterações. Tente novamente."
        );
      } finally {
        setIsSavingBatch(false);
        saveOperationRef.current = null;
      }
    };

    saveOperationRef.current = saveOperation();
    return saveOperationRef.current;
  }, [
    user?.id,
    pendingChanges,
    setSuccess,
    setErrorWithClear,
    queryClient,
    queryKey,
    validateMessHallCodes,
  ]);

  // Auto-save
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    if (pendingChanges.length === 0) return;

    autoSaveTimerRef.current = setTimeout(() => {
      savePendingChanges();
    }, AUTO_SAVE_DELAY);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [pendingChanges, savePendingChanges]);

  // Client-side hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  const loadExistingForecasts = useCallback(async (): Promise<void> => {
    await refetch();
  }, [refetch]);

  return {
    success,
    error,
    isLoading: isPending,
    isRefetching: isFetching,
    pendingChanges,
    isSavingBatch,
    selections,
    dayMessHalls,
    defaultMessHallCode,
    dates,
    todayString,

    setSuccess,
    setError: setErrorWithClear,
    setPendingChanges,
    setSelections,
    setDayMessHalls,
    setDefaultMessHallCode,

    loadExistingForecasts,
    savePendingChanges,
    clearMessages,
  };
};
