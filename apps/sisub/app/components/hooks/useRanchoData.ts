// apps/sisub/app/components/hooks/useRanchoData.ts
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@iefa/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import supabase from "../../utils/supabase";

const DEFAULT_UNIT = "DIRAD - DIRAD";
const DAYS_TO_SHOW = 30;
const AUTO_SAVE_DELAY = 1500;
const SUCCESS_MESSAGE_DURATION = 3000;

export interface DayMeals {
  cafe: boolean;
  almoco: boolean;
  janta: boolean;
  ceia: boolean;
}

export interface Selections {
  [date: string]: DayMeals;
}

export interface DayUnits {
  [date: string]: string;
}

export interface PendingChange {
  date: string;
  meal: keyof DayMeals;
  value: boolean;
  unidade: string;
}

export interface RanchoDataHook {
  success: string;
  error: string;
  isLoading: boolean; // carregamento inicial
  isRefetching: boolean; // refetch em background
  pendingChanges: PendingChange[];
  isSavingBatch: boolean;
  selections: Selections;
  dayUnits: DayUnits;
  defaultUnit: string;
  dates: string[];
  todayString: string;
  setSuccess: (msg: string) => void;
  setError: (msg: string) => void;
  setPendingChanges: React.Dispatch<React.SetStateAction<PendingChange[]>>;
  setSelections: React.Dispatch<React.SetStateAction<Selections>>;
  setDayUnits: React.Dispatch<React.SetStateAction<DayUnits>>;
  setDefaultUnit: (unit: string) => void;
  loadExistingPrevisoes: () => Promise<void>;
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
 * Formata um objeto Date para 'YYYY-MM-DD' respeitando o fuso local.
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

// Helpers de pluralização
const pluralize = (count: number, singular: string, plural: string) =>
  count === 1 ? singular : plural;

const labelAlteracao = (n: number) => pluralize(n, "alteração", "alterações");
const labelSalva = (n: number) => pluralize(n, "salva", "salvas");
const labelFalhou = (n: number) => pluralize(n, "falhou", "falharam");
const labelOperacao = (n: number) => pluralize(n, "operação", "operações");

export const useRanchoData = (): RanchoDataHook => {
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
  const [selections, setSelections] = useState<Selections>({});
  const [dayUnits, setDayUnits] = useState<DayUnits>({});
  const [defaultUnit, setDefaultUnit] = useState<string>(DEFAULT_UNIT);

  // Datas e chaves estáveis
  const dates = useMemo(() => generateDates(DAYS_TO_SHOW), []);
  const todayString = useMemo(() => toYYYYMMDD(new Date()), []);
  const queryKey = useMemo(
    () => ["ranchoPrevisoes", user?.id, dates[0], dates[dates.length - 1]],
    [user?.id, dates]
  );

  // Mensagens
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

  // Query: previsões do período para o usuário
  const {
    data: previsoes,
    isPending, // carregamento inicial
    isFetching, // qualquer refetch ativo
    refetch,
  } = useQuery({
    queryKey,
    enabled: isClient && !!user?.id,
    staleTime: 60_000, // mantém dados "frescos" por 1 min
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    keepPreviousData: true,
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

  // Hidratamos selections/dayUnits a partir da query quando:
  // - primeira carga, ou
  // - refetch terminar e NÃO houver pendingChanges e NÃO estivermos salvando.
  useEffect(() => {
    if (!user?.id) return;
    if (!previsoes) return;

    const canOverwrite = pendingChanges.length === 0 && !isSavingBatch;
    if (!hydratedOnceRef.current || canOverwrite) {
      const initialSelections: Selections = {};
      const initialUnits: DayUnits = {};

      dates.forEach((date) => {
        initialSelections[date] = createEmptyDayMeals();
        initialUnits[date] = defaultUnit;
      });

      previsoes.forEach((p: any) => {
        const { data, unidade, refeicao, vai_comer } = p;
        if (initialSelections[data] && refeicao in initialSelections[data]) {
          initialSelections[data][refeicao as keyof DayMeals] = !!vai_comer;
          initialUnits[data] = unidade || defaultUnit;
        }
      });

      setSelections(initialSelections);
      setDayUnits(initialUnits);
      hydratedOnceRef.current = true;
    }
  }, [
    user?.id,
    previsoes,
    dates,
    defaultUnit,
    pendingChanges.length,
    isSavingBatch,
  ]);

  // Save em lote (mantido, mas invalida/atualiza a query no fim)
  const savePendingChanges = useCallback(async (): Promise<void> => {
    if (!user?.id || pendingChanges.length === 0) return;

    // Evitar múltiplas operações simultâneas
    if (saveOperationRef.current) {
      await saveOperationRef.current;
      return;
    }

    const saveOperation = async () => {
      setIsSavingBatch(true);
      setErrorWithClear("");

      try {
        const changesToSave = [...pendingChanges];

        // Agrupar por data-refeição para evitar duplicatas
        const changesByDateAndMeal = changesToSave.reduce(
          (acc, change) => {
            const key = `${change.date}-${change.meal}`;
            acc[key] = change;
            return acc;
          },
          {} as { [key: string]: PendingChange }
        );

        const results = await Promise.allSettled(
          Object.values(changesByDateAndMeal).map(async (change) => {
            try {
              if (change.value) {
                // upsert
                const { error: upsertError } = await supabase
                  .from("rancho_previsoes")
                  .upsert(
                    {
                      data: change.date,
                      unidade: change.unidade,
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
                  // fallback delete + insert
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
                      unidade: change.unidade,
                      user_id: user.id,
                      refeicao: change.meal,
                      vai_comer: true,
                    });

                  if (insertError) throw insertError;
                }
              } else {
                // delete
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
            } catch (error) {
              console.error(
                `Erro ao processar mudança para ${change.date}-${change.meal}:`,
                error
              );
              return {
                success: false,
                change,
                error:
                  error instanceof Error ? error.message : "Erro desconhecido",
              };
            }
          })
        );

        const successful = results.filter(
          (r) => r.status === "fulfilled" && r.value.success
        ) as PromiseFulfilledResult<{
          success: boolean;
          change: PendingChange;
        }>[]; // TS narrow

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
                    saved.unidade === change.unidade
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
                    ok.unidade === change.unidade
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

        // Após salvar, atualizamos em background os dados do servidor
        // sem travar a UI
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
  ]);

  // Auto-save (mantém fluidez e evita múltiplos saves)
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

  const loadExistingPrevisoes = useCallback(async (): Promise<void> => {
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
    dayUnits,
    defaultUnit,
    dates,
    todayString,

    setSuccess,
    setError: setErrorWithClear,
    setPendingChanges,
    setSelections,
    setDayUnits,
    setDefaultUnit,

    loadExistingPrevisoes,
    savePendingChanges,
    clearMessages,
  };
};
