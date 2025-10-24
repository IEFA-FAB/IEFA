// Rancho.tsx

import {
  lazy,
  Suspense,
  useState,
  useCallback,
  useMemo,
  type JSX,
} from "react";
import {
  Loader2,
  Settings,
  RefreshCw,
  UtensilsCrossed,
} from "lucide-react";

import { Button } from "@iefa/ui";
import {
  useRanchoData,
  type PendingChange,
  type Selections,
  type DayUnits,
} from "~/components/hooks/useRanchoData";

import { DefaultUnitSelector } from "~/components/rancho/DefaultUnitSelector";
import { AlertMessages } from "~/components/AlertMessage";
import { PendingChangesStatus } from "~/components/rancho/PendingChangesStatus";
import {
  createEmptyDayMeals,
  formatDate,
  getDayOfWeek,
  isDateNear,
  type DayMeals,
} from "~/utils/RanchoUtils";
import { NEAR_DATE_THRESHOLD } from "~/components/constants/rancho";
import { DayCardSkeleton } from "~/components/rancho/DayCard";
import SimplifiedMilitaryStatsSkeleton from "~/components/rancho/SimplifiedMilitaryStatsSkeleton";
import BulkMealSelector from "~/components/rancho/BulkMealSelector";
import type { Route } from "./+types/rancho";

const SimplifiedMilitaryStats = lazy(
  () => import("~/components/rancho/SimplifiedMilitaryStats")
);
const DayCard = lazy(() => import("~/components/rancho/DayCard"));

/* ============================
   Constantes, utilitários e helpers de texto
   ============================ */

const DIRAD_UNIT = "DIRAD" as const;

const WORKDAY_TEMPLATE_MEALS: ReadonlyArray<keyof DayMeals> = [
  "cafe",
  "almoco",
] as const;

interface CardData {
  date: string;
  daySelections: DayMeals;
  dayUnit: string;
}

// Pluralização simples
const pluralize = (count: number, singular: string, plural: string) =>
  count === 1 ? singular : plural;

const labelAlteracao = (n: number) => pluralize(n, "alteração", "alterações");
const labelCard = (n: number) => pluralize(n, "card", "cards");
const labelDiaUtil = (n: number) => pluralize(n, "dia útil", "dias úteis");
const labelTem = (n: number) => pluralize(n, "tem", "têm"); // concordância verbal

// Função pura para calcular dados do card (sem hooks)
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
    pendingChanges,
    isSavingBatch,
    selections,
    dayUnits,
    defaultUnit,
    dates,
    todayString,
    setSuccess,
    setError,
    setPendingChanges,
    setSelections,
    setDayUnits,
    setDefaultUnit,
    loadExistingPrevisoes,
    savePendingChanges,
    clearMessages,
  } = useRanchoData();

  const [showDefaultUnitSelector, setShowDefaultUnitSelector] = useState(false);
  const [isApplyingDefaultUnit, setIsApplyingDefaultUnit] = useState(false);

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
    const cardsWithoutUnit = dates.filter((date) => {
      const unit = dayUnits[date];
      return !unit || unit === DIRAD_UNIT;
    });

    const cardData: CardData[] = dates.map((date) => ({
      date,
      daySelections: selections[date] || createEmptyDayMeals(),
      dayUnit: dayUnits[date] || defaultUnit,
    }));

    return { cardsWithoutUnit, cardData };
  }, [dates, dayUnits, selections, defaultUnit]);

  const dayCardsProps = useMemo(() => {
    return computedData.cardData.map(({ date, daySelections, dayUnit }) => {
      const dayCardData = getDayCardData(date, todayString, daySelections);
      return {
        key: date,
        date,
        daySelections,
        dayUnit,
        defaultUnit,
        ...dayCardData,
        pendingChanges,
        isSaving: false,
      };
    });
  }, [computedData.cardData, todayString, defaultUnit, pendingChanges]);

  /* ============================
     Callbacks
     ============================ */

  const handleMealToggle = useCallback(
    (date: string, meal: keyof DayMeals): void => {
      if (isDateNear(date, NEAR_DATE_THRESHOLD)) return;

      const currentValue = selections[date]?.[meal] || false;
      const newValue = !currentValue;
      const unidade = dayUnits[date] || defaultUnit;

      setSelections((prev: Selections) => {
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
          copy[idx] = { date, meal, value: newValue, unidade };
          return copy;
        }
        return [...prev, { date, meal, value: newValue, unidade }];
      });
    },
    [selections, dayUnits, defaultUnit, setSelections, setPendingChanges]
  );

  const handleUnitChange = useCallback(
    (date: string, newUnit: string): void => {
      if (isDateNear(date, NEAR_DATE_THRESHOLD)) return;

      setDayUnits((prev: DayUnits) => ({ ...prev, [date]: newUnit }));

      const dayMeals = selections[date];
      if (!dayMeals) return;

      const selectedMeals: PendingChange[] = Object.entries(dayMeals)
        .filter(([, isSelected]) => isSelected)
        .map(([meal, value]) => ({
          date,
          meal: meal as keyof DayMeals,
          value,
          unidade: newUnit,
        }));

      if (!selectedMeals.length) return;

      setPendingChanges((prev: PendingChange[]) => {
        const filtered = prev.filter((c) => c.date !== date);
        return [...filtered, ...selectedMeals];
      });
    },
    [selections, setDayUnits, setPendingChanges]
  );

  const handleRefresh = useCallback((): void => {
    loadExistingPrevisoes();
  }, [loadExistingPrevisoes]);

  const handleToggleUnitSelector = useCallback((): void => {
    setShowDefaultUnitSelector((prev) => !prev);
  }, []);

  const handleCancelUnitSelector = useCallback((): void => {
    setShowDefaultUnitSelector(false);
  }, []);

  const applyDefaultUnitToAll = useCallback(async (): Promise<void> => {
    const { cardsWithoutUnit } = computedData;
    if (cardsWithoutUnit.length === 0) return;

    setIsApplyingDefaultUnit(true);

    try {
      const updatedUnits: DayUnits = { ...dayUnits };
      cardsWithoutUnit.forEach((date) => {
        updatedUnits[date] = defaultUnit;
      });
      setDayUnits(updatedUnits);

      const newPendingChanges: PendingChange[] = [];

      cardsWithoutUnit.forEach((date) => {
        const dayMeals = selections[date];
        if (!dayMeals) return;

        Object.entries(dayMeals)
          .filter(([, isSelected]) => isSelected)
          .forEach(([meal, value]) => {
            newPendingChanges.push({
              date,
              meal: meal as keyof DayMeals,
              value,
              unidade: defaultUnit,
            });
          });
      });

      if (newPendingChanges.length > 0) {
        setPendingChanges((prev: PendingChange[]) => {
          const filtered = prev.filter(
            (change) => !cardsWithoutUnit.includes(change.date)
          );
          return [...filtered, ...newPendingChanges];
        });
      }

      // Pluralização de "card"
      setSuccess(
        `Unidade padrão "${defaultUnit}" aplicada a ${
          cardsWithoutUnit.length
        } ${labelCard(cardsWithoutUnit.length)}!`
      );
      setShowDefaultUnitSelector(false);
    } catch (err) {
      console.error("Erro ao aplicar unidade padrão:", err);
      setError("Erro ao aplicar unidade padrão. Tente novamente.");
    } finally {
      setIsApplyingDefaultUnit(false);
    }
  }, [
    computedData,
    dayUnits,
    defaultUnit,
    selections,
    setDayUnits,
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

          const unidadeParaDia =
            dayUnits[date] && dayUnits[date] !== DIRAD_UNIT
              ? dayUnits[date]
              : defaultUnit;

          (Object.keys(after) as (keyof DayMeals)[]).forEach((k) => {
            if (after[k] !== before[k]) {
              newChanges.push({
                date,
                meal: k,
                value: after[k],
                unidade: unidadeParaDia,
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
          const next: Selections = { ...prev };
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

        // Pluralização de dia útil e alteração
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
      dayUnits,
      defaultUnit,
      setSelections,
      setPendingChanges,
      setSuccess,
      setError,
    ]
  );

  /* ============================
     Loading state
     ============================ */

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-screen-2xl w-full">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Carregando previsões...</p>
        </div>
      </div>
    );
  }

  const { cardsWithoutUnit } = computedData;

  /* ============================
     Render
     ============================ */

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 md:px-8 py-4 sm:py-6 space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg sm:text-xl font-semibold text-gray-800">
            Previsão SISUB
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleUnitSelector}
              className="text-orange-600 border-orange-600 hover:bg-orange-50 cursor-pointer"
              aria-label="Definir unidade padrão"
            >
              <Settings className="h-4 w-4 mr-2" />
              Unidade Padrão ({cardsWithoutUnit.length})
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkMealSelector(!showBulkMealSelector)}
              disabled={isLoading}
              className="text-green-600 border-green-600 hover:bg-green-50 cursor-pointer"
              aria-label="Aplicar refeições em massa"
            >
              <UtensilsCrossed className="h-4 w-4 mr-2" />
              Refeições em Massa ({weekdayTargets.length})
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="cursor-pointer"
              aria-label="Recarregar previsões"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </header>

        {/* Controles */}
        <section className="space-y-4">
          {showDefaultUnitSelector && (
            <div className="rounded-lg border bg-white shadow-sm">
              <div className="p-4 sm:p-5">
                <DefaultUnitSelector
                  defaultUnit={defaultUnit}
                  setDefaultUnit={setDefaultUnit}
                  cardsWithoutUnit={cardsWithoutUnit}
                  onApply={applyDefaultUnitToAll}
                  onCancel={handleCancelUnitSelector}
                  isApplying={isApplyingDefaultUnit}
                />
              </div>
            </div>
          )}

          {showBulkMealSelector && (
            <div className="rounded-lg border bg-white shadow-sm">
              <div className="p-4 sm:p-5">
                <BulkMealSelector
                  targetDates={weekdayTargets}
                  initialTemplate={{ cafe: true, almoco: true }}
                  onApply={applyMealTemplateToAll}
                  onCancel={() => setShowBulkMealSelector(false)}
                  isApplying={isApplyingMealTemplate}
                />
                {weekdayTargetsNeedingFillCount > 0 && (
                  <p className="mt-3 text-xs text-gray-500">
                    Dica: {weekdayTargetsNeedingFillCount}{" "}
                    {labelDiaUtil(weekdayTargetsNeedingFillCount)}{" "}
                    {labelTem(weekdayTargetsNeedingFillCount)} refeições
                    faltando no template.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Alertas e status */}
        <section className="space-y-3">
          <AlertMessages
            success={success}
            error={error}
            onClearMessages={clearMessages}
          />
          <PendingChangesStatus
            pendingChanges={pendingChanges}
            isSavingBatch={isSavingBatch}
          />
        </section>

        {/* Estatísticas */}
        <section className="rounded-lg border bg-white shadow-sm">
          <div className="p-4 sm:p-5">
            <Suspense fallback={<SimplifiedMilitaryStatsSkeleton />}>
              <SimplifiedMilitaryStats selections={selections} dates={dates} />
            </Suspense>
          </div>
        </section>

        {/* Cards */}
        <section>
          <div className="overflow-x-auto pb-2 -mx-2 px-2">
            <div className="flex space-x-4 min-w-max p-1 snap-x snap-mandatory">
              {dayCardsProps.map((cardProps) => (
                <Suspense fallback={<DayCardSkeleton />} key={cardProps.key}>
                  <div className="snap-start">
                    <DayCard
                      {...cardProps}
                      onMealToggle={handleMealToggle}
                      onUnitChange={handleUnitChange}
                    />
                  </div>
                </Suspense>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Botão de salvar */}
      {/* {pendingChanges.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 px-4 w-full sm:w-auto">
          <div className="mx-auto max-w-screen-2xl">
            <div className="flex justify-center">
              <Button
                onClick={savePendingChanges}
                disabled={isSavingBatch}
                className="shadow-lg cursor-pointer w-full sm:w-auto"
                size="lg"
                aria-label={`Salvar ${pendingChanges.length} ${labelAlteracao(
                  pendingChanges.length
                )}`}
              >
                {isSavingBatch ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar {pendingChanges.length}{" "}
                {labelAlteracao(pendingChanges.length)}
              </Button>
            </div>
          </div>
        </div>
      )} */}
    </div>
  );
}
