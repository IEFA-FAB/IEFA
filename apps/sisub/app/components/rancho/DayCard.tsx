// components/DayCard.tsx
import { memo, useCallback, useMemo } from "react";
import { Calendar, Loader2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@iefa/ui";
import { Badge } from "@iefa/ui";
import { Button } from "@iefa/ui";
import { Skeleton } from "@iefa/ui";
import { MealButton } from "~/components/MealButton";
import { UnitSelector } from "~/components/UnitSelector";
import { MEAL_TYPES } from "~/components/constants/rancho";
import type { DayMeals } from "~/utils/RanchoUtils";
import { cn } from "~/utils/utils";

interface PendingChange {
  date: string;
  meal: keyof DayMeals;
  value: boolean;
  unidade: string;
}

interface DayCardProps {
  date: string;
  daySelections: DayMeals;
  dayUnit: string;
  defaultUnit: string;
  onMealToggle: (date: string, meal: keyof DayMeals) => void;
  onUnitChange: (date: string, newUnit: string) => void;
  formattedDate: string;
  dayOfWeek: string;
  isToday: boolean;
  isDateNear: boolean;
  pendingChanges: PendingChange[];
  isSaving?: boolean;
  selectedMealsCount?: number;
  isLoading?: boolean;
}

const countSelectedMeals = (daySelections: DayMeals): number => {
  return Object.values(daySelections).filter(Boolean).length;
};

// Componente Skeleton usando shadcn/ui
const DayCardSkeleton = memo(() => {
  return (
    <Card className="w-80 flex-shrink-0">
      <CardHeader className="pb-3">
        <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
          {/* Header esquerdo */}
          <div className="flex items-center space-x-2">
            <Skeleton className="h-4 w-4" />
            <div className="space-y-1">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>

          {/* Header direito */}
          <div className="flex items-center space-x-1">
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
        </div>

        {/* Progress bar skeleton */}
        <div className="h-12 flex items-center">
          <div className="w-full bg-muted/50 rounded-lg p-2 border">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <div className="flex space-x-1">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="w-2 h-2 rounded-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-rows-[auto_1fr_auto] gap-3 min-h-[200px]">
          {/* Unit selector skeleton */}
          <div className="bg-muted/30 rounded-lg p-3 border">
            <Skeleton className="h-8 w-full" />
          </div>

          {/* Meals grid skeleton */}
          <div className="grid grid-cols-2 gap-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>

          {/* Action buttons skeleton */}
          <div className="h-9 flex items-center">
            <div className="flex gap-2 w-full">
              <Skeleton className="flex-1 h-7" />
              <Skeleton className="flex-1 h-7" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

DayCardSkeleton.displayName = "DayCardSkeleton";

export const DayCard = memo<DayCardProps>(
  ({
    date,
    daySelections,
    dayUnit,
    defaultUnit,
    onMealToggle,
    onUnitChange,
    formattedDate,
    dayOfWeek,
    isToday,
    isDateNear,
    pendingChanges,
    isSaving = false,
    selectedMealsCount,
    isLoading = false,
  }) => {
    // Se está carregando, mostra o skeleton
    if (isLoading) {
      return <DayCardSkeleton />;
    }

    const cardState = useMemo(() => {
      const hasPendingChanges = pendingChanges.some(
        (change) => change.date === date
      );
      const selectedCount =
        selectedMealsCount ?? countSelectedMeals(daySelections);
      const isUsingNonDefaultUnit =
        dayUnit && dayUnit !== defaultUnit && dayUnit !== "DIRAD";

      return {
        hasPendingChanges,
        selectedCount,
        isUsingNonDefaultUnit,
        isEmpty: selectedCount === 0,
        isFull: selectedCount === 4,
        hasPartialSelection: selectedCount > 0 && selectedCount < 4,
      };
    }, [
      pendingChanges,
      date,
      daySelections,
      dayUnit,
      defaultUnit,
      selectedMealsCount,
    ]);

    const cardClasses = useMemo(() => {
      return cn(
        "w-80 flex-shrink-0 transition-all duration-200 hover:shadow-md relative",
        {
          // Estados visuais principais
          "ring-2 ring-primary shadow-lg bg-primary/5": isToday,
          "ring-1 ring-orange-400 bg-orange-50":
            cardState.hasPendingChanges && !isToday,
          "opacity-75 grayscale-[0.3]": isDateNear && !isToday,

          // Estados de preenchimento
          "bg-green-50 border-green-200": cardState.isFull && !isToday,
          "bg-yellow-50 border-yellow-200":
            cardState.hasPartialSelection &&
            !isToday &&
            !cardState.hasPendingChanges,
          "bg-muted/30":
            cardState.isEmpty && !isToday && !cardState.hasPendingChanges,
        }
      );
    }, [isToday, isDateNear, cardState]);

    const handleMealToggle = useCallback(
      (meal: keyof DayMeals) => {
        onMealToggle(date, meal);
      },
      [date, onMealToggle]
    );

    const handleUnitChange = useCallback(
      (newUnit: string) => {
        onUnitChange(date, newUnit);
      },
      [date, onUnitChange]
    );

    const isDisabled = isSaving || isDateNear;

    return (
      <Card className={cardClasses}>
        <CardHeader className="pb-3">
          {/* Header com grid para manter posições fixas */}
          <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
            {/* Seção esquerda - sempre presente */}
            <div className="flex items-center space-x-2 min-w-0">
              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <h3 className="font-semibold text-foreground truncate">
                  {formattedDate}
                </h3>
                <p className="text-sm text-muted-foreground capitalize truncate">
                  {dayOfWeek}
                </p>
              </div>
            </div>

            {/* Seção direita - badges e indicadores */}
            <div className="flex items-center space-x-1 flex-shrink-0">
              {isSaving && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              {isDateNear && <Clock className="h-4 w-4 text-orange-500" />}
              {isToday && (
                <Badge variant="default" className="text-xs px-2 py-0">
                  Hoje
                </Badge>
              )}
              {cardState.hasPendingChanges && (
                <Badge
                  variant="outline"
                  className="text-xs text-orange-600 px-2 py-0"
                >
                  Salvando
                </Badge>
              )}
            </div>
          </div>

          {/* Progress bar - altura fixa para evitar movimento */}
          <div className="h-12 flex items-center">
            {cardState.selectedCount > 0 && (
              <div className="w-full bg-background/80 backdrop-blur-sm rounded-lg p-2 border border-border/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {cardState.selectedCount}/4 refeições
                  </span>
                  <div className="flex space-x-1">
                    {MEAL_TYPES.map((meal) => {
                      const mealKey = meal.value as keyof DayMeals;
                      const isSelected = daySelections[mealKey];
                      return (
                        <div
                          key={meal.value}
                          className={cn(
                            "w-2 h-2 rounded-full transition-all duration-200",
                            isSelected
                              ? "bg-green-500 scale-110"
                              : "bg-muted-foreground/30"
                          )}
                          title={`${meal.label}: ${
                            isSelected ? "Confirmado" : "Não vai"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {/* Layout principal em grid com altura mínima fixa */}
          <div className="grid grid-rows-[auto_1fr_auto] gap-3 min-h-[200px]">
            {/* Unit selector - sempre presente */}
            <div className="bg-primary/5 backdrop-blur-sm rounded-lg p-3 border border-primary/20">
              <UnitSelector
                value={dayUnit}
                onChange={handleUnitChange}
                disabled={isDisabled}
                hasDefaultUnit={false}
              />
            </div>

            {/* Grid de refeições - sempre 2x2 */}
            <div className="grid grid-cols-2 gap-2">
              {MEAL_TYPES.map((meal) => {
                const mealKey = meal.value as keyof DayMeals;
                return (
                  <MealButton
                    key={meal.value}
                    meal={meal}
                    isSelected={daySelections[mealKey]}
                    onToggle={() => handleMealToggle(mealKey)}
                    disabled={isDisabled}
                    compact={true}
                  />
                );
              })}
            </div>

            {/* Botões de ação - altura fixa */}
            <div className="h-9 flex items-center">
              {!isDisabled && (
                <div className="flex gap-2 w-full">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      MEAL_TYPES.forEach((meal) => {
                        const mealKey = meal.value as keyof DayMeals;
                        if (!daySelections[mealKey]) {
                          handleMealToggle(mealKey);
                        }
                      });
                    }}
                    className="flex-1 text-xs h-7"
                  >
                    Todas
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      MEAL_TYPES.forEach((meal) => {
                        const mealKey = meal.value as keyof DayMeals;
                        if (daySelections[mealKey]) {
                          handleMealToggle(mealKey);
                        }
                      });
                    }}
                    className="flex-1 text-xs h-7"
                  >
                    Limpar
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
);

DayCard.displayName = "DayCard";

// Hooks permanecem iguais
export const useDayCardData = (
  date: string,
  todayString: string,
  isDateNear: (date: string) => boolean,
  formatDate: (date: string) => string,
  getDayOfWeek: (date: string) => string,
  daySelections: DayMeals,
  pendingChanges: PendingChange[]
) => {
  return useMemo(() => {
    const selectedMealsCount = countSelectedMeals(daySelections);
    const hasPendingChanges = pendingChanges.some(
      (change) => change.date === date
    );

    return {
      formattedDate: formatDate(date),
      dayOfWeek: getDayOfWeek(date),
      selectedMealsCount,
      isDateNear: isDateNear(date),
      isToday: date === todayString,
      hasPendingChanges,
      isEmpty: selectedMealsCount === 0,
      isFull: selectedMealsCount === 4,
      hasPartialSelection: selectedMealsCount > 0 && selectedMealsCount < 4,
    };
  }, [
    date,
    todayString,
    isDateNear,
    formatDate,
    getDayOfWeek,
    daySelections,
    pendingChanges,
  ]);
};

export const useDayCardOptimization = (
  dates: string[],
  selections: Record<string, DayMeals>
) => {
  return useMemo(() => {
    const optimizedData: Record<
      string,
      { selectedCount: number; isEmpty: boolean; isFull: boolean }
    > = {};

    dates.forEach((date) => {
      const daySelections = selections[date];
      const selectedCount = daySelections
        ? countSelectedMeals(daySelections)
        : 0;

      optimizedData[date] = {
        selectedCount,
        isEmpty: selectedCount === 0,
        isFull: selectedCount === 4,
      };
    });

    return optimizedData;
  }, [dates, selections]);
};

export { DayCardSkeleton };
export default DayCard;
