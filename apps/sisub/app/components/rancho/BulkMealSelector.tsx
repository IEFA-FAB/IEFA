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
  Badge,
  Label,
  Button,
} from "@iefa/ui";
import { MealButton } from "~/components/MealButton";
import { MEAL_TYPES } from "~/components/constants/rancho";
import { createEmptyDayMeals, type DayMeals } from "~/utils/RanchoUtils";

type ApplyMode = "fill-missing" | "override";

interface BulkMealSelectorProps {
  targetDates: string[]; // Datas (YYYY-MM-DD) que receberão o template
  initialTemplate?: Partial<DayMeals>; // Template inicial
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

    // Tokens shadcn/ui
    const cardClasses = useMemo(
      () =>
        [
          "relative overflow-hidden rounded-2xl",
          "bg-card text-card-foreground border border-border",
          "shadow-sm transition-all duration-300",
          "hover:shadow-md hover:border-accent",
        ].join(" "),
      []
    );

    const modeBtnBase =
      "text-xs sm:text-sm h-8 px-3 border rounded-md transition-colors";
    const modeBtnSelected = "bg-primary text-primary-foreground border-primary";
    const modeBtnUnselected = "border-border text-foreground hover:bg-muted";

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
        {/* Decorações sutis com tokens */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 -right-10 h-24 w-24 rounded-full bg-accent/20 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-8 h-24 w-24 rounded-full bg-secondary/20 blur-2xl"
        />

        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between text-foreground">
            <div className="flex items-center gap-2">
              <span
                className="
                  inline-flex items-center justify-center h-8 w-8 rounded-lg
                  bg-background text-primary ring-1 ring-border
                "
              >
                <UtensilsCrossed className="h-5 w-5" />
              </span>
              <span>Aplicar Refeições em Massa</span>
            </div>

            <Badge
              variant="outline"
              className={
                hasCardsToApply
                  ? "border-accent text-accent"
                  : "border-border text-muted-foreground"
              }
            >
              {cardsCount} card{cardsCount !== 1 ? "s" : ""}
            </Badge>
          </CardTitle>

          <CardDescription className="text-foreground/80 mt-3">
            <div
              className="
                flex items-start gap-2 rounded-md border p-2.5
                bg-accent/10 text-accent-foreground border-accent/30
              "
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="text-sm">
                Selecione o conjunto de refeições e aplique a vários cards de
                uma vez. Você pode escolher entre preencher somente onde está
                vazio ou sobrescrever tudo.
              </span>
            </div>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Modo de aplicação */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              Modo de aplicação:
            </Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className={`${modeBtnBase} ${
                  applyMode === "fill-missing"
                    ? modeBtnSelected
                    : modeBtnUnselected
                }`}
                onClick={() => setApplyMode("fill-missing")}
                disabled={isApplying}
              >
                Preencher onde está vazio
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`${modeBtnBase} ${
                  applyMode === "override" ? modeBtnSelected : modeBtnUnselected
                }`}
                onClick={() => setApplyMode("override")}
                disabled={isApplying}
              >
                Sobrescrever tudo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Selecionadas:{" "}
              <strong className="text-foreground">{selectedCount}</strong> de 4
              refeições.
            </p>
          </div>

          {/* Grid de refeições (padrão do DayCard) */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-foreground">
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
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAll(true)}
                disabled={isApplying}
                className="text-xs hover:bg-muted"
              >
                Todas
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAll(false)}
                disabled={isApplying}
                className="text-xs hover:bg-muted"
              >
                Nenhuma
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={setWorkdayPreset}
                disabled={isApplying}
                className="text-xs hover:bg-muted"
              >
                Padrão Dias Úteis
              </Button>
            </div>
          </div>

          {/* Rodapé com ações */}
          <div className="border-t border-border pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                Aplicar template selecionado a{" "}
                <span className="text-foreground">{cardsCount}</span> card
                {cardsCount !== 1 ? "s" : ""} (
                {applyMode === "fill-missing"
                  ? "preencher onde está vazio"
                  : "sobrescrever"}
                ).
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isApplying}
                  className="
                    hover:bg-muted
                    focus-visible:ring-2 focus-visible:ring-ring
                    focus-visible:ring-offset-2 focus-visible:ring-offset-background
                  "
                >
                  Cancelar
                </Button>

                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={
                    isApplying || !hasCardsToApply || selectedCount === 0
                  }
                  className="
                    bg-primary text-primary-foreground hover:bg-primary/90
                    focus-visible:ring-2 focus-visible:ring-ring
                    focus-visible:ring-offset-2 focus-visible:ring-offset-background
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
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
            <div
              className="
                mt-4 text-xs rounded-md border p-3
                bg-muted text-muted-foreground border-border
              "
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground mb-1">
                    Importante:
                  </p>
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
