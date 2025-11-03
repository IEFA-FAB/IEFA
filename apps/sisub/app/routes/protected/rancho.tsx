// apps/sisub/app/routes/rancho.tsx

import {
  lazy,
  Suspense,
  useState,
  useCallback,
  useMemo,
  type JSX,
} from "react";
import { Loader2, Settings, RefreshCw, UtensilsCrossed } from "lucide-react";

import { Button } from "@iefa/ui";
import {
  useMealForecast,
  type PendingChange,
  type SelectionsByDate,
  type MessHallByDate,
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

const DayCard = lazy(() => import("~/components/rancho/DayCard"));

/* ============================
   Constantes, utilitários e helpers de texto
   ============================ */

const WORKDAY_TEMPLATE_MEALS: ReadonlyArray<keyof DayMeals> = [
  "cafe",
  "almoco",
] as const;

interface CardData {
  date: string;
  daySelections: DayMeals;
  dayUnit: string; // mapped to DayCard's prop name
}

// Pluralização simples
const pluralize = (count: number, singular: string, plural: string) =>
  count === 1 ? singular : plural;

const labelAlteracao = (n: number) => pluralize(n, "alteração", "alterações");
const labelCard = (n: number) => pluralize(n, "card", "cards");
const labelDiaUtil = (n: number) => pluralize(n, "dia útil", "dias úteis");
const labelTem = (n: number) => pluralize(n, "tem", "têm");

// Função pura para calcular dados do card
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
    dayMessHalls,
    defaultMessHallCode,
    dates,
    todayString,
    setSuccess,
    setError,
    setPendingChanges,
    setSelections,
    setDayMessHalls,
    setDefaultMessHallCode,
    loadExistingForecasts,
    savePendingChanges, // disponível caso você precise em outro fluxo
    clearMessages,
  } = useMealForecast();

  
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

  const weekdayTargetsNeedingFillCount = useMemo(() => {
    return weekdayTargets.filter((date) => {
      const dm = selections[date] || createEmptyDayMeals();
      return WORKDAY_TEMPLATE_MEALS.some((meal) => !dm[meal]);
    }).length;
  }, [weekdayTargets, selections]);

  const computedData = useMemo(() => {
    // "Cards sem rancho" = datas sem um código de rancho definido (falsy)
    const cardsWithoutMessHall = dates.filter((date) => {
      const mh = dayMessHalls[date];
      return !mh;
    });

    const cardData: CardData[] = dates.map((date) => ({
      date,
      daySelections: selections[date] || createEmptyDayMeals(),
      dayUnit: dayMessHalls[date] || defaultMessHallCode, // mapeado para DayCard
    }));

    return { cardsWithoutMessHall, cardData };
  }, [dates, dayMessHalls, selections, defaultMessHallCode]);

  // Mapear pendingChanges (com messHallCode) para o formato que o DayCard espera (unidade)
  const pendingChangesForCard = useMemo(
    () =>
      (pendingChanges ?? []).map((c) => ({
        date: c.date,
        meal: c.meal,
        value: c.value,
        unidade: c.messHallCode,
      })),
    [pendingChanges]
  );

  const dayCardsProps = useMemo(() => {
    return computedData.cardData.map(({ date, daySelections, dayUnit }) => {
      const dayCardData = getDayCardData(date, todayString, daySelections);
      return {
        key: date,
        date,
        daySelections,
        dayUnit, // DayCard prop
        defaultUnit: defaultMessHallCode, // DayCard prop
        ...dayCardData,
        isSaving: false,
      };
    });
  }, [computedData.cardData, todayString, defaultMessHallCode]);

  /* ============================
     Callbacks
     ============================ */

  const handleMealToggle = useCallback(
    (date: string, meal: keyof DayMeals): void => {
      if (isDateNear(date, NEAR_DATE_THRESHOLD)) return;

      const currentValue = selections[date]?.[meal] || false;
      const newValue = !currentValue;
      const messHallCode = dayMessHalls[date] || defaultMessHallCode;

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
          copy[idx] = { date, meal, value: newValue, messHallCode };
          return copy;
        }
        return [...prev, { date, meal, value: newValue, messHallCode }];
      });
    },
    [
      selections,
      dayMessHalls,
      defaultMessHallCode,
      setSelections,
      setPendingChanges,
    ]
  );

  const handleMessHallChange = useCallback(
    (date: string, newMessHallCode: string): void => {
      if (isDateNear(date, NEAR_DATE_THRESHOLD)) return;

      setDayMessHalls((prev: MessHallByDate) => ({
        ...prev,
        [date]: newMessHallCode,
      }));

      const dayMeals = selections[date];
      if (!dayMeals) return;

      const selectedMeals: PendingChange[] = Object.entries(dayMeals)
        .filter(([, isSelected]) => isSelected)
        .map(([meal, value]) => ({
          date,
          meal: meal as keyof DayMeals,
          value,
          messHallCode: newMessHallCode,
        }));

      if (!selectedMeals.length) return;

      setPendingChanges((prev: PendingChange[]) => {
        const filtered = prev.filter((c) => c.date !== date);
        return [...filtered, ...selectedMeals];
      });
    },
    [selections, setDayMessHalls, setPendingChanges]
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

    setIsApplyingDefaultMessHall(true);

    try {
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
              messHallCode: defaultMessHallCode,
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
    } finally {
      setIsApplyingDefaultMessHall(false);
    }
  }, [
    computedData,
    dayMessHalls,
    defaultMessHallCode,
    selections,
    setDayMessHalls,
    setPendingChanges,
    setSuccess,
    setError,
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

          const messHallForDay =
            dayMessHalls[date] && dayMessHalls[date] !== ""
              ? dayMessHalls[date]
              : defaultMessHallCode;

          (Object.keys(after) as (keyof DayMeals)[]).forEach((k) => {
            if (after[k] !== before[k]) {
              newChanges.push({
                date,
                meal: k,
                value: after[k],
                messHallCode: messHallForDay,
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
      setSelections,
      setPendingChanges,
      setSuccess,
      setError,
    ]
  );

  

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
            defaultMessHallCode={defaultMessHallCode}
            setDefaultMessHallCode={setDefaultMessHallCode}
            onApply={applyDefaultMessHallToAll}
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
                  // Ajuste de nomes para o DayCard
                  // - dayUnit e defaultUnit já preparados em dayCardsProps
                  // - pendingChanges deve ter 'unidade' em vez de 'messHallCode'
                  pendingChanges={pendingChangesForCard}
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
