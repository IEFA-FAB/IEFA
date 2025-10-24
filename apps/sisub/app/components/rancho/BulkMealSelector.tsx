// components/BulkMealSelector.tsx
import { memo, useCallback, useMemo, useState } from "react";
import {
  UtensilsCrossed,
  CheckCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@iefa/ui";
import { Badge } from "@iefa/ui";
import { Label } from "@iefa/ui";
import { Button } from "@iefa/ui";
import { MealButton } from "~/components/MealButton";
import { MEAL_TYPES } from "~/components/constants/rancho";
import { createEmptyDayMeals, type DayMeals } from "~/utils/RanchoUtils";

type ApplyMode = "fill-missing" | "override";

interface BulkMealSelectorProps {
  // Datas (YYYY-MM-DD) que receberão o template
  targetDates: string[];
  // Template inicial de refeições; se ausente, inicia tudo desmarcado
  initialTemplate?: Partial<DayMeals>;
  // Ao aplicar, retorna o template final e o modo escolhido
  onApply: (template: DayMeals, options: { mode: ApplyMode }) => Promise<void>;
  onCancel: () => void;
  isApplying: boolean;
}

export const BulkMealSelector = memo<BulkMealSelectorProps>(
  ({ targetDates, initialTemplate, onApply, onCancel, isApplying }) => {
    // Estado local do template de refeições
    const [template, setTemplate] = useState<DayMeals>(() => {
      const base = createEmptyDayMeals();
      if (initialTemplate) {
        Object.entries(initialTemplate).forEach(([key, val]) => {
          (base as any)[key] = Boolean(val);
        });
      }
      return base;
    });

    const [applyMode, setApplyMode] = useState<ApplyMode>("fill-missing");

    const cardsCount = targetDates.length;
    const hasCardsToApply = cardsCount > 0;

    // Classes (tema “verde” para refeições, espelhando o estilo do DefaultUnitSelector)
    const cardClasses = useMemo(
      () =>
        "border-green-200 bg-green-50 shadow-sm transition-all duration-200",
      []
    );
    const cancelButtonClasses = useMemo(
      () =>
        "border-green-200 text-green-700 hover:bg-green-100 cursor-pointer transition-colors",
      []
    );
    const applyButtonClasses = useMemo(
      () =>
        "bg-green-600 hover:bg-green-700 text-white cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
      []
    );
    const modeButtonBase =
      "text-xs sm:text-sm h-8 px-3 border cursor-pointer transition-colors";
    const modeButtonSelected = "bg-green-600 text-white border-green-700";
    const modeButtonUnselected =
      "border-green-200 text-green-700 hover:bg-green-100";

    const selectedCount = useMemo(
      () => Object.values(template).filter(Boolean).length,
      [template]
    );

    const toggleMeal = useCallback(
      (mealKey: keyof DayMeals) => {
        if (isApplying) return;
        setTemplate((prev) => ({ ...prev, [mealKey]: !prev[mealKey] }));
      },
      [isApplying]
    );

    const setAll = useCallback(
      (value: boolean) => {
        if (isApplying) return;
        setTemplate((prev) => {
          const next: DayMeals = { ...prev };
          Object.keys(next).forEach((k) => {
            (next as any)[k] = value;
          });
          return next;
        });
      },
      [isApplying]
    );

    const setWorkdayPreset = useCallback(() => {
      if (isApplying) return;
      setTemplate((prev) => {
        const next: DayMeals = { ...prev };
        // Café + Almoço marcados, demais desmarcados
        Object.keys(next).forEach((k) => {
          (next as any)[k] = k === "cafe" || k === "almoco";
        });
        return next;
      });
    }, [isApplying]);

    const handleApply = useCallback(async () => {
      if (!hasCardsToApply || isApplying) return;
      try {
        await onApply(template, { mode: applyMode });
      } catch (err) {
        console.error("Erro ao aplicar template de refeições:", err);
      }
    }, [hasCardsToApply, isApplying, onApply, template, applyMode]);

    const handleCancel = useCallback(() => {
      if (isApplying) return;
      onCancel();
    }, [isApplying, onCancel]);

    return (
      <Card className={cardClasses}>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between text-green-800">
            <div className="flex items-center space-x-2">
              <UtensilsCrossed className="h-5 w-5" />
              <span>Aplicar Refeições em Massa</span>
            </div>
            <Badge
              variant="outline"
              className="text-green-700 border-green-300"
            >
              {cardsCount} card{cardsCount !== 1 ? "s" : ""}
            </Badge>
          </CardTitle>

          <CardDescription className="text-green-700 flex items-start space-x-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              Selecione o conjunto de refeições e aplique a vários cards de uma
              vez. Você pode escolher entre preencher somente onde está vazio ou
              sobrescrever tudo.
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Modo de aplicação */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-green-800">
              Modo de aplicação:
            </Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className={`${modeButtonBase} ${
                  applyMode === "fill-missing"
                    ? modeButtonSelected
                    : modeButtonUnselected
                }`}
                onClick={() => setApplyMode("fill-missing")}
                disabled={isApplying}
              >
                Preencher onde está vazio
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`${modeButtonBase} ${
                  applyMode === "override"
                    ? modeButtonSelected
                    : modeButtonUnselected
                }`}
                onClick={() => setApplyMode("override")}
                disabled={isApplying}
              >
                Sobrescrever tudo
              </Button>
            </div>
            <p className="text-xs text-green-700">
              Selecionadas: <strong>{selectedCount}</strong> de 4 refeições.
            </p>
          </div>

          {/* Grid de refeições (padrão do DayCard) */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-green-800">
              Escolha as refeições:
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {MEAL_TYPES.map((meal) => {
                const mealKey = meal.value as keyof DayMeals;
                return (
                  <MealButton
                    key={meal.value}
                    meal={meal}
                    isSelected={template[mealKey]}
                    onToggle={() => toggleMeal(mealKey)}
                    disabled={isApplying}
                    compact={true}
                  />
                );
              })}
            </div>

            {/* Presets rápidos */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAll(true)}
                disabled={isApplying}
                className="text-xs"
              >
                Todas
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAll(false)}
                disabled={isApplying}
                className="text-xs"
              >
                Nenhuma
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={setWorkdayPreset}
                disabled={isApplying}
                className="text-xs"
              >
                Padrão Dias Úteis
              </Button>
            </div>
          </div>

          {/* Rodapé com ações */}
          <div className="border-t border-green-200 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-sm text-green-700">
                <span>
                  Aplicar template selecionado a {cardsCount} card
                  {cardsCount !== 1 ? "s" : ""} (
                  {applyMode === "fill-missing"
                    ? "preencher onde está vazio"
                    : "sobrescrever"}
                  ).
                </span>
              </div>

              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isApplying}
                  className={cancelButtonClasses}
                >
                  Cancelar
                </Button>

                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={
                    isApplying || !hasCardsToApply || selectedCount === 0
                  }
                  className={applyButtonClasses}
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Aplicando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Aplicar a {cardsCount} card{cardsCount !== 1 ? "s" : ""}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Informação adicional */}
            <div className="mt-4 text-xs text-green-700 bg-green-50 p-3 rounded-md border border-green-200">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium mb-1">Importante:</p>
                  <ul className="space-y-1">
                    <li>
                      • “Preencher onde está vazio” não desmarca seleções já
                      existentes
                    </li>
                    <li>
                      • “Sobrescrever tudo” redefine as refeições conforme o
                      template
                    </li>
                    <li>
                      • Datas muito próximas podem ser ignoradas pelo fluxo de
                      negócio
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
);

BulkMealSelector.displayName = "BulkMealSelector";

export default BulkMealSelector;
