// apps/sisub/app/routes/rancho.tsx
import {
  lazy,
  Suspense,
  useState,
  useCallback,
  useMemo,
  type JSX,
} from "react";
import { Settings, RefreshCw, UtensilsCrossed } from "lucide-react";

import { Button } from "@iefa/ui";
import {
  useMealForecast,
  type PendingChange,
  type SelectionsByDate,
  type MessHallByDate, // Record<date, messHallCode>
} from "~/components/hooks/useMealForecast";

import { DefaultMessHallSelector } from "~/components/rancho/DefaultMessHallSelector";
import {
  createEmptyDayMeals,
  formatDate,
  getDayOfWeek,
  isDateNear,
  type DayMeals,
} from "~/utils/RanchoUtils";
import { NEAR_DATE_THRESHOLD } from "~/components/constants/rancho";
import { DayCardSkeleton } from "~/components/rancho/DayCard";
import BulkMealSelector from "~/components/rancho/BulkMealSelector";
import type { Route } from "./+types/rancho";

import SimplifiedMilitaryStats from "~/components/rancho/SimplifiedMilitaryStats";
import { UnifiedStatusToasts } from "~/components/rancho/UnifiedStatusToasts";
import { useMessHalls } from "~/components/hooks/useMessHalls";

const DayCard = lazy(() => import("~/components/rancho/DayCard"));

/* ============================
   Utilitários e helpers de texto
   ============================ */

interface CardData {
  date: string;
  daySelections: DayMeals;
  dayMessHallCode: string; // UI usa CODE
}

// Pluralização simples
const pluralize = (count: number, singular: string, plural: string) =>
  count === 1 ? singular : plural;

const labelAlteracao = (n: number) => pluralize(n, "alteração", "alterações");
const labelCard = (n: number) => pluralize(n, "card", "cards");
const labelDiaUtil = (n: number) => pluralize(n, "dia útil", "dias úteis");

// Dados derivados por card
const getDayCardData = (
  date: string,
  todayString: string,
  daySelections: DayMeals
) => {
  const formattedDate = formatDate(date);
  const dayOfWeek = getDayOfWeek(date);
  const selectedMealsCount =
    Object.values(daySelections).filter(Boolean).length;
  const isDateNearValue = isDateNear(date, NEAR_DATE_THRESHOLD);
  const isToday = date === todayString;

  return {
    formattedDate,
    dayOfWeek,
    selectedMealsCount,
    isDateNear: isDateNearValue,
    isToday,
  };
};

const isWeekday = (dateString: string): boolean => {
  const d = new Date(`${dateString}T00:00:00`);
  const dow = d.getDay(); // 0=Dom, 1=Seg, ..., 6=Sáb
  return dow >= 1 && dow <= 5;
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Previsão SISUB" },
    { name: "description", content: "Faça sua previsão" },
  ];
}

/* ============================
   Componente principal
   ============================ */

export default function Rancho(): JSX.Element {
  const {
    success,
    error,
    isLoading,
    isRefetching, // refetch em background
    pendingChanges,
    isSavingBatch,
    selections,
    dayMessHalls, // Record<date, messHallCode> (UI usa CODE)
    dates,
    todayString,
    setSuccess,
    setError,
    setPendingChanges,
    setSelections,
    setDayMessHalls,
    loadExistingForecasts,
    clearMessages,

    defaultMessHallId, // ID (string)
    setDefaultMessHallId, // setter local (string)
    persistDefaultMessHallId, // persiste no user_data
  } = useMealForecast();

  // Mapeia ID <-> CODE para falar com os Selectors (que operam por "code")
  const { messHalls } = useMessHalls();

  const defaultMessHallCode = useMemo(() => {
    if (!defaultMessHallId) return "";
    const mh = messHalls.find(
      (m) => String(m.id) === String(defaultMessHallId)
    );
    return mh?.code ?? "";
  }, [defaultMessHallId, messHalls]);

  const setDefaultMessHallCode = useCallback(
    (code: string) => {
      const mh = messHalls.find((m) => m.code === code);
      if (mh?.id != null) {
        // apenas local, sem persistir
        setDefaultMessHallId(String(mh.id));
      }
    },
    [messHalls, setDefaultMessHallId]
  );

  // Helpers: resolver ID por CODE (para PendingChange/salvar)
  const getMessHallIdByCode = useCallback(
    (code?: string | null): string => {
      if (!code) return "";
      const match = messHalls.find((m) => m.code === code);
      return match?.id != null ? String(match.id) : "";
    },
    [messHalls]
  );

  // Por data: ui code -> id (com fallback no default)
  const resolveMessHallIdForDate = useCallback(
    (date: string): string => {
      const code = dayMessHalls[date] || defaultMessHallCode || "";
      const idFromCode = getMessHallIdByCode(code);
      return idFromCode || (defaultMessHallId ? String(defaultMessHallId) : "");
    },
    [dayMessHalls, defaultMessHallCode, defaultMessHallId, getMessHallIdByCode]
  );

  const [showDefaultMessHallSelector, setShowDefaultMessHallSelector] =
    useState(false);
  const [isApplyingDefaultMessHall, setIsApplyingDefaultMessHall] =
    useState(false);

  // Seletor de refeições em massa
  const [showBulkMealSelector, setShowBulkMealSelector] = useState(false);
  const [isApplyingMealTemplate, setIsApplyingMealTemplate] = useState(false);

  /* ============================
     Derivações e memos
     ============================ */

  const weekdayTargets = useMemo(
    () =>
      dates.filter(
        (date) => isWeekday(date) && !isDateNear(date, NEAR_DATE_THRESHOLD)
      ),
    [dates]
  );

  const computedData = useMemo(() => {
    // "Cards sem rancho" = datas sem um messHallCode definido (falsy)
    const cardsWithoutMessHall = dates.filter((date) => {
      const code = dayMessHalls[date];
      return !code;
    });

    const cardData: CardData[] = dates.map((date) => ({
      date,
      daySelections: selections[date] || createEmptyDayMeals(),
      // UI sempre com CODE
      dayMessHallCode: dayMessHalls[date] || defaultMessHallCode || "",
    }));

    return { cardsWithoutMessHall, cardData };
  }, [dates, dayMessHalls, selections, defaultMessHallCode]);

  const dayCardsProps = useMemo(() => {
    return computedData.cardData.map(
      ({ date, daySelections, dayMessHallCode }) => {
        const dayCardData = getDayCardData(date, todayString, daySelections);
        return {
          key: date,
          date,
          daySelections,
          // DayCard e MessHallSelector trabalham com CODE (mantemos nome por compat)
          dayMessHallId: dayMessHallCode,
          // Também passamos o default como CODE
          defaultMessHallId: defaultMessHallCode,
          ...dayCardData,
          isSaving: false,
        };
      }
    );
  }, [computedData.cardData, todayString, defaultMessHallCode]);

  /* ============================
     Callbacks
     ============================ */

  const handleMealToggle = useCallback(
    (date: string, meal: keyof DayMeals): void => {
      if (isDateNear(date, NEAR_DATE_THRESHOLD)) return;

      // Resolve ID correto para o dia (a partir do CODE em UI)
      const messHallId = resolveMessHallIdForDate(date);
      if (!messHallId) {
        setError("Defina seu rancho padrão antes de marcar refeições.");
        return;
      }

      const currentValue = selections[date]?.[meal] || false;
      const newValue = !currentValue;

      setSelections((prev: SelectionsByDate) => {
        const existing = prev[date] ?? createEmptyDayMeals();
        return {
          ...prev,
          [date]: {
            ...existing,
            [meal]: newValue,
          },
        };
      });

      setPendingChanges((prev: PendingChange[]) => {
        const idx = prev.findIndex((c) => c.date === date && c.meal === meal);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { date, meal, value: newValue, messHallId };
          return copy;
        }
        return [...prev, { date, meal, value: newValue, messHallId }];
      });
    },
    [
      selections,
      resolveMessHallIdForDate,
      setSelections,
      setPendingChanges,
      setError,
    ]
  );

  const handleMessHallChange = useCallback(
    (date: string, newMessHallCode: string): void => {
      if (isDateNear(date, NEAR_DATE_THRESHOLD)) return;

      // Na UI persistimos CODE por data
      setDayMessHalls((prev: MessHallByDate) => ({
        ...prev,
        [date]: newMessHallCode,
      }));

      const dayMeals = selections[date];
      if (!dayMeals) return;

      // Para alterações existentes no dia, atualizamos o mess_hall_id (ID)
      const messHallId = getMessHallIdByCode(newMessHallCode);
      if (!messHallId) return;

      const selectedMeals: PendingChange[] = Object.entries(dayMeals)
        .filter(([, isSelected]) => isSelected)
        .map(([meal, value]) => ({
          date,
          meal: meal as keyof DayMeals,
          value,
          messHallId,
        }));

      if (!selectedMeals.length) return;

      setPendingChanges((prev: PendingChange[]) => {
        const filtered = prev.filter((c) => c.date !== date);
        return [...filtered, ...selectedMeals];
      });
    },
    [selections, setDayMessHalls, setPendingChanges, getMessHallIdByCode]
  );

  const handleRefresh = useCallback((): void => {
    loadExistingForecasts();
  }, [loadExistingForecasts]);

  const handleToggleMessHallSelector = useCallback((): void => {
    setShowDefaultMessHallSelector((prev) => !prev);
  }, []);

  const handleCancelMessHallSelector = useCallback((): void => {
    setShowDefaultMessHallSelector(false);
  }, []);

  const applyDefaultMessHallToAll = useCallback(async (): Promise<void> => {
    const { cardsWithoutMessHall } = computedData;
    if (cardsWithoutMessHall.length === 0) return;

    try {
      // Backend: usa ID (precisa estar resolvido)
      const messHallIdForDefault =
        defaultMessHallId || getMessHallIdByCode(defaultMessHallCode) || "";

      if (!messHallIdForDefault) {
        setError("Defina e salve um rancho padrão antes de aplicar aos cards.");
        return;
      }

      // UI: grava CODE nos dias sem rancho
      const updatedMessHalls: MessHallByDate = { ...dayMessHalls };
      cardsWithoutMessHall.forEach((date) => {
        updatedMessHalls[date] = defaultMessHallCode;
      });
      setDayMessHalls(updatedMessHalls);

      const newPendingChanges: PendingChange[] = [];

      cardsWithoutMessHall.forEach((date) => {
        const dayMeals = selections[date];
        if (!dayMeals) return;

        Object.entries(dayMeals)
          .filter(([, isSelected]) => isSelected)
          .forEach(([meal, value]) => {
            newPendingChanges.push({
              date,
              meal: meal as keyof DayMeals,
              value,
              messHallId: String(messHallIdForDefault),
            });
          });
      });

      if (newPendingChanges.length > 0) {
        setPendingChanges((prev: PendingChange[]) => {
          const filtered = prev.filter(
            (change) => !cardsWithoutMessHall.includes(change.date)
          );
          return [...filtered, ...newPendingChanges];
        });
      }

      setSuccess(
        `Rancho padrão "${defaultMessHallCode}" aplicado a ${cardsWithoutMessHall.length} ${labelCard(
          cardsWithoutMessHall.length
        )}!`
      );
      setShowDefaultMessHallSelector(false);
    } catch (err) {
      console.error("Erro ao aplicar rancho padrão:", err);
      setError("Erro ao aplicar rancho padrão. Tente novamente.");
    }
  }, [
    computedData,
    dayMessHalls,
    defaultMessHallCode,
    defaultMessHallId,
    selections,
    setDayMessHalls,
    setPendingChanges,
    setSuccess,
    setError,
    getMessHallIdByCode,
  ]);

  const applyMealTemplateToAll = useCallback(
    async (
      template: DayMeals,
      options: { mode: "fill-missing" | "override" }
    ): Promise<void> => {
      const targetDates = weekdayTargets;
      if (!targetDates.length) {
        setShowBulkMealSelector(false);
        return;
      }

      setIsApplyingMealTemplate(true);
      try {
        const newChanges: PendingChange[] = [];
        const afterByDate: Record<string, DayMeals> = {};

        targetDates.forEach((date) => {
          const before = selections[date] || createEmptyDayMeals();
          const after: DayMeals = { ...before };

          if (options.mode === "override") {
            (Object.keys(after) as (keyof DayMeals)[]).forEach((k) => {
              after[k] = Boolean(template[k]);
            });
          } else {
            (Object.keys(after) as (keyof DayMeals)[]).forEach((k) => {
              if (template[k]) after[k] = after[k] || true;
            });
          }

          // UI (CODE) -> Backend (ID)
          const codeForDay =
            (dayMessHalls[date] && dayMessHalls[date] !== ""
              ? dayMessHalls[date]
              : defaultMessHallCode) || "";
          const idForDay =
            getMessHallIdByCode(codeForDay) ||
            (defaultMessHallId ? String(defaultMessHallId) : "");

          (Object.keys(after) as (keyof DayMeals)[]).forEach((k) => {
            if (after[k] !== before[k]) {
              if (!idForDay) {
                // se não há ID resolvido, não empilha alteração inválida
                return;
              }
              newChanges.push({
                date,
                meal: k,
                value: after[k],
                messHallId: idForDay,
              });
            }
          });

          afterByDate[date] = after;
        });

        if (newChanges.length === 0) {
          setSuccess(
            "Nenhuma alteração necessária para aplicar o template em dias úteis."
          );
          setShowBulkMealSelector(false);
          return;
        }

        setSelections((prev) => {
          const next: SelectionsByDate = { ...prev };
          targetDates.forEach((date) => {
            next[date] = afterByDate[date];
          });
          return next;
        });

        setPendingChanges((prev) => {
          const toRemove = new Set(
            newChanges.map((c) => `${c.date}|${String(c.meal)}`)
          );
          const filtered = prev.filter(
            (c) => !toRemove.has(`${c.date}|${String(c.meal)}`)
          );
          return [...filtered, ...newChanges];
        });

        const diasStr = `${targetDates.length} ${labelDiaUtil(
          targetDates.length
        )}`;
        const alteracoesStr = `${newChanges.length} ${labelAlteracao(
          newChanges.length
        )}`;

        setSuccess(
          `Template de refeições aplicado a ${diasStr} no modo ${
            options.mode === "override" ? "sobrescrever" : "preencher"
          }: ${alteracoesStr}.`
        );
        setShowBulkMealSelector(false);
      } catch (err) {
        console.error("Erro ao aplicar template de refeições:", err);
        setError("Erro ao aplicar template de refeições. Tente novamente.");
      } finally {
        setIsApplyingMealTemplate(false);
      }
    },
    [
      weekdayTargets,
      selections,
      dayMessHalls,
      defaultMessHallCode,
      defaultMessHallId,
      setSelections,
      setPendingChanges,
      setSuccess,
      setError,
      getMessHallIdByCode,
    ]
  );

  const handleApplyDefault = useCallback(async () => {
    setIsApplyingDefaultMessHall(true);
    try {
      // Persiste o default no user_data
      await persistDefaultMessHallId();

      // Aplica default aos cards (UI + pendingChanges) e mensagem
      await applyDefaultMessHallToAll();

      // Refaz fetch (default + forecasts) para refletir tudo da fonte de verdade
      await loadExistingForecasts();
    } finally {
      setIsApplyingDefaultMessHall(false);
    }
  }, [
    persistDefaultMessHallId,
    applyDefaultMessHallToAll,
    loadExistingForecasts,
  ]);

  /* ============================
     Render
     ============================ */

  return (
    <div className="h-full container flex-col mx-auto px-4 sm:px-6 md:px-8 py-4 sm:py-6 space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-semibold">Previsão SISUB</h1>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleMessHallSelector}
            className=" hover:bg-orange-50 cursor-pointer"
            aria-label="Definir rancho padrão"
          >
            <Settings className="h-4 w-4 mr-2" />
            Rancho Padrão
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBulkMealSelector(!showBulkMealSelector)}
            disabled={isLoading}
            className=" hover:bg-green-50 cursor-pointer"
            aria-label="Aplicar refeições em massa"
          >
            <UtensilsCrossed className="h-4 w-4 mr-2" />
            Refeições em Massa ({weekdayTargets.length})
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading || isRefetching}
            className="cursor-pointer"
            aria-label="Recarregar previsões"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </header>

      {/* Controles */}
      <section className="gap-8 flex flex-row w-full">
        {showDefaultMessHallSelector && (
          <DefaultMessHallSelector
            // Selector opera por "code"; aqui fazemos o bridge ID <-> code
            defaultMessHallCode={defaultMessHallCode}
            setDefaultMessHallCode={setDefaultMessHallCode}
            onApply={handleApplyDefault}
            onCancel={handleCancelMessHallSelector}
            isApplying={isApplyingDefaultMessHall}
          />
        )}

        {showBulkMealSelector && (
          <BulkMealSelector
            targetDates={weekdayTargets}
            initialTemplate={{ cafe: true, almoco: true }}
            onApply={applyMealTemplateToAll}
            onCancel={() => setShowBulkMealSelector(false)}
            isApplying={isApplyingMealTemplate}
          />
        )}
      </section>

      {/* Overlay: Toasts unificados (bottom-center) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
        <UnifiedStatusToasts
          success={success}
          error={error}
          onClearMessages={clearMessages}
          pendingChanges={pendingChanges}
          isSavingBatch={isSavingBatch}
          autoHideSuccessMs={6000}
        />
      </div>

      {/* Estatísticas */}
      <section className="w-full">
        <div className="p-4 sm:p-5">
          <div className="p-4 sm:p-5">
            <SimplifiedMilitaryStats
              selections={selections}
              dates={dates}
              isLoading={isRefetching}
            />
          </div>
        </div>
      </section>

      {/* Cards */}
      <section aria-labelledby="cards-title">
        <h2 id="cards-title" className="sr-only">
          Previsão por dia
        </h2>

        <div
          className="flex flex-row columns-auto justify-center items-center w-full flex-wrap gap-8"
          role="region"
          aria-label="Lista de cards por dia"
        >
          {dayCardsProps.map((cardProps) => (
            <Suspense fallback={<DayCardSkeleton />} key={cardProps.key}>
              <div className="snap-center">
                <DayCard
                  {...cardProps}
                  // IMPORTANTE: DayCard espera valores como CODE, então:
                  // - dayMessHallId (prop) recebe CODE
                  // - defaultMessHallId (prop) recebe CODE
                  pendingChanges={pendingChanges}
                  onMealToggle={handleMealToggle}
                  onMessHallChange={handleMessHallChange}
                />
              </div>
            </Suspense>
          ))}
        </div>
      </section>
    </div>
  );
}
