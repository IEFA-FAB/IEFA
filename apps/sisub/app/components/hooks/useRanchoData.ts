import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@iefa/auth";
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
  isLoading: boolean;
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
 * Formata um objeto Date para uma string 'YYYY-MM-DD' respeitando o fuso horário local.
 * @param date O objeto Date a ser formatado.
 * @returns A data formatada como string.
 */
const toYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  // getMonth() é 0-indexado (0-11), então somamos 1
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
    dates.push(toYYYYMMDD(date)); // CORRIGIDO: Usa a função auxiliar para evitar problemas de fuso
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

  const [isClient, setIsClient] = useState(false);

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveOperationRef = useRef<Promise<void> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [success, setSuccessState] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [isSavingBatch, setIsSavingBatch] = useState<boolean>(false);
  const [selections, setSelections] = useState<Selections>({});
  const [dayUnits, setDayUnits] = useState<DayUnits>({});
  const [defaultUnit, setDefaultUnit] = useState<string>(DEFAULT_UNIT);

  // Memorizar valores estáveis
  const dates = useMemo(() => generateDates(DAYS_TO_SHOW), []);
  const todayString = useMemo(() => toYYYYMMDD(new Date()), []); // CORRIGIDO: Usa a função auxiliar

  // Callbacks estáveis
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

  // Callback estável para setError
  const setErrorWithClear = useCallback((msg: string) => {
    setError(msg);
    setSuccessState("");
  }, []);

  // loadExistingPrevisoes com dependências estáveis
  const loadExistingPrevisoes = useCallback(async (): Promise<void> => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    setIsLoading(true);
    setErrorWithClear("");

    try {
      const { data: previsoes, error: supabaseError } = await supabase
        .from("rancho_previsoes")
        .select("data, unidade, refeicao, vai_comer")
        .eq("user_id", user.id)
        .gte("data", dates[0])
        .lte("data", dates[dates.length - 1])
        .order("data", { ascending: true });

      if (signal.aborted) return;

      if (supabaseError) throw supabaseError;

      const initialSelections: Selections = {};
      const initialUnits: DayUnits = {};

      dates.forEach((date) => {
        initialSelections[date] = createEmptyDayMeals();
        initialUnits[date] = defaultUnit;
      });

      previsoes?.forEach((previsao) => {
        const { data, unidade, refeicao, vai_comer } = previsao;

        if (initialSelections[data] && refeicao in initialSelections[data]) {
          initialSelections[data][refeicao as keyof DayMeals] = vai_comer;
          initialUnits[data] = unidade;
        }
      });

      if (!signal.aborted) {
        setSelections(initialSelections);
        setDayUnits(initialUnits);
      }
    } catch (err) {
      if (!signal.aborted) {
        console.error("Erro ao carregar previsões:", err);
        setErrorWithClear(
          "Erro ao carregar previsões existentes. Tente novamente."
        );
      }
    } finally {
      if (!signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [user?.id, dates, defaultUnit, setErrorWithClear]);

  // Função savePendingChanges melhorada e mais robusta
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

        // Agrupar mudanças por data e refeição para evitar operações duplicadas
        const changesByDateAndMeal = changesToSave.reduce(
          (acc, change) => {
            const key = `${change.date}-${change.meal}`;
            acc[key] = change;
            return acc;
          },
          {} as { [key: string]: PendingChange }
        );

        // Processar cada mudança individualmente com operações específicas
        const results = await Promise.allSettled(
          Object.values(changesByDateAndMeal).map(async (change) => {
            try {
              if (change.value) {
                // Se vai_comer = true, fazer upsert (insert ou update)
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
                  // Fallback: Se upsert falhar, tentar delete + insert
                  console.warn(
                    `Upsert falhou para ${change.date}-${change.meal}, tentando delete+insert:`,
                    upsertError
                  );

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
                // Se vai_comer = false, deletar apenas o registro específico
                const { error: deleteError } = await supabase
                  .from("rancho_previsoes")
                  .delete()
                  .eq("user_id", user.id)
                  .eq("data", change.date)
                  .eq("refeicao", change.meal);

                if (deleteError) {
                  // Se o erro for "registro não encontrado", não é um erro crítico
                  if (!deleteError.message.includes("No rows deleted")) {
                    throw deleteError;
                  }
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

        // Processar resultados e dar feedback detalhado
        const successful = results.filter(
          (result) => result.status === "fulfilled" && result.value.success
        ) as PromiseFulfilledResult<{
          success: boolean;
          change: PendingChange;
        }>[];

        const failed = results.filter(
          (result) =>
            result.status === "rejected" ||
            (result.status === "fulfilled" && !result.value.success)
        );

        if (failed.length === 0) {
          // Todas as operações foram bem-sucedidas
          const n = changesToSave.length;
          setSuccess(`${n} ${labelAlteracao(n)} ${labelSalva(n)} com sucesso!`);

          // Remover apenas as mudanças que foram processadas com sucesso
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
          // Algumas operações falharam, mas outras foram bem-sucedidas
          const nOk = successful.length;
          const nFail = failed.length;

          setSuccess(
            `${nOk} ${labelAlteracao(nOk)} ${labelSalva(nOk)}. ${nFail} ${labelAlteracao(
              nFail
            )} ${labelFalhou(nFail)}.`
          );

          // Remover apenas as mudanças que foram salvas com sucesso
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

          // Log detalhado dos erros para debug
          failed.forEach((result) => {
            if (result.status === "fulfilled") {
              console.error("Erro na operação:", result.value.error);
            } else {
              console.error("Promise rejeitada:", result.reason);
            }
          });
        } else {
          // Todas as operações falharam
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
      } catch (err) {
        console.error("Erro crítico ao salvar mudanças:", err);
        setErrorWithClear(
          err instanceof Error
            ? `Erro ao salvar ${labelAlteracao(1)}: ${err.message}` // "alteração" como conceito
            : "Erro ao salvar alterações. Tente novamente."
        );
      } finally {
        setIsSavingBatch(false);
        saveOperationRef.current = null;
      }
    };

    saveOperationRef.current = saveOperation();
    return saveOperationRef.current;
  }, [user?.id, pendingChanges, setSuccess, setErrorWithClear]);

  // Auto-save effect com dependência estável
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

  // Carregar previsões quando o cliente estiver pronto
  useEffect(() => {
    if (isClient && user?.id) {
      loadExistingPrevisoes();
    }
  }, [isClient, user?.id, loadExistingPrevisoes]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    success,
    error,
    isLoading,
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
