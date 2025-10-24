// components/DefaultUnitSelector.tsx
import { memo, useCallback, useMemo } from "react";
import { Settings, CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@iefa/ui";
import { Label } from "@iefa/ui";
import { Button } from "@iefa/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@iefa/ui";
import { Badge } from "@iefa/ui";
import { useRancho } from "../hooks/useRancho";

interface DefaultUnitSelectorProps {
  defaultUnit: string;
  setDefaultUnit: (unit: string) => void;
  cardsWithoutUnit: string[]; // Array de dates (strings)
  onApply: () => Promise<void>;
  onCancel: () => void;
  isApplying: boolean;
}

export const DefaultUnitSelector = memo<DefaultUnitSelectorProps>(
  ({
    defaultUnit,
    setDefaultUnit,
    cardsWithoutUnit,
    onApply,
    onCancel,
    isApplying,
  }) => {
    const { ranchos } = useRancho();

    // Dados computados (corrigidas dependências para evitar label “stale”)
    const selectorData = useMemo(() => {
      const cardsCount = cardsWithoutUnit.length;
      const hasCardsToApply = cardsCount > 0;

      const selectedUnitLabel =
        ranchos.find((unit) => unit.value === defaultUnit)?.label ||
        defaultUnit;

      const hasUnits = (ranchos?.length ?? 0) > 0;

      return {
        cardsCount,
        hasCardsToApply,
        selectedUnitLabel,
        hasUnits,
      };
    }, [cardsWithoutUnit, defaultUnit, ranchos]);

    // Classes por tema (accent = laranja)
    const cardClasses = useMemo(
      () =>
        [
          "group relative overflow-hidden",
          "border border-orange-200 bg-orange-50/70",
          "shadow-sm transition-all duration-300",
          "hover:shadow-md hover:border-orange-300",
          "rounded-2xl",
        ].join(" "),
      []
    );

    const headerChipClasses = useMemo(
      () =>
        "inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white text-orange-700 ring-1 ring-orange-200",
      []
    );

    const selectTriggerClasses = useMemo(
      () =>
        [
          "w-full cursor-pointer",
          "border-orange-200 bg-white",
          "focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2",
          "hover:border-orange-300",
        ].join(" "),
      []
    );

    const cancelButtonClasses = useMemo(
      () =>
        [
          "border-orange-200 text-orange-700",
          "hover:bg-orange-100/60",
          "focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2",
        ].join(" "),
      []
    );

    const applyButtonClasses = useMemo(
      () =>
        [
          "bg-orange-600 hover:bg-orange-700 text-white",
          "focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2",
          "disabled:opacity-60 disabled:cursor-not-allowed",
        ].join(" "),
      []
    );

    // Handlers
    const handleUnitChange = useCallback(
      (value: string) => {
        setDefaultUnit(value);
      },
      [setDefaultUnit]
    );

    const handleApply = useCallback(async () => {
      if (!selectorData.hasCardsToApply || isApplying) return;
      try {
        await onApply();
      } catch (error) {
        console.error("Erro ao aplicar unidade padrão:", error);
      }
    }, [selectorData.hasCardsToApply, isApplying, onApply]);

    const handleCancel = useCallback(() => {
      if (isApplying) return;
      onCancel();
    }, [isApplying, onCancel]);

    // Itens do select (corrigido deps para ranchos)
    const selectItems = useMemo(() => {
      if (!ranchos || ranchos.length === 0) {
        return (
          <div className="px-2 py-4 text-sm text-muted-foreground">
            Nenhuma unidade encontrada.
          </div>
        );
      }
      return ranchos.map((rancho) => (
        <SelectItem
          className="cursor-pointer focus:bg-orange-50 hover:bg-orange-50"
          key={rancho.value}
          value={rancho.value}
        >
          {rancho.label}
        </SelectItem>
      ));
    }, [ranchos]);

    const { cardsCount, hasCardsToApply, selectedUnitLabel, hasUnits } =
      selectorData;

    return (
      <Card className={cardClasses}>
        {/* Decoração sutil */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 -right-10 h-24 w-24 rounded-full bg-orange-200/30 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-8 h-24 w-24 rounded-full bg-amber-200/30 blur-2xl"
        />

        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <CardTitle className="text-orange-900">
              <span className="flex items-center gap-2">
                <span className={headerChipClasses}>
                  <Settings className="h-4.5 w-4.5" />
                </span>
                <span className="font-semibold">Configurar Unidade Padrão</span>
              </span>
            </CardTitle>

            <Badge
              variant="outline"
              className={[
                "border",
                cardsCount > 0
                  ? "border-orange-300 text-orange-700"
                  : "border-gray-300 text-gray-600",
              ].join(" ")}
            >
              {cardsCount} card{cardsCount !== 1 ? "s" : ""}
            </Badge>
          </div>

          <CardDescription className="mt-3">
            <div className="flex gap-2 rounded-md border border-orange-200 bg-orange-100/70 p-2.5 text-orange-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="text-sm">
                Defina uma unidade padrão para os cards que ainda não possuem
                unidade definida no banco de dados. Esta ação afetará apenas os
                cards sem unidade configurada.
              </span>
            </div>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="text-sm font-medium text-orange-900">
              Selecione a unidade padrão:
            </Label>

            <Select
              value={defaultUnit}
              onValueChange={handleUnitChange}
              disabled={isApplying || !hasUnits}
            >
              <SelectTrigger className={selectTriggerClasses}>
                <SelectValue
                  placeholder={
                    hasUnits
                      ? "Selecione uma unidade..."
                      : "Sem unidades disponíveis"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-60">{selectItems}</SelectContent>
            </Select>

            {defaultUnit && (
              <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-100 p-2 rounded-md border border-orange-200">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>
                  Unidade selecionada:{" "}
                  <strong className="text-orange-900">
                    {selectedUnitLabel}
                  </strong>
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-orange-200 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div
                className={[
                  "text-sm flex items-center gap-2",
                  hasCardsToApply ? "text-orange-800" : "text-gray-500",
                ].join(" ")}
              >
                <CheckCircle className="h-4 w-4" />
                <span>
                  Aplicar "{selectedUnitLabel || "—"}" a {cardsCount} card
                  {cardsCount !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="flex items-center gap-2">
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
                  disabled={isApplying || !hasCardsToApply || !defaultUnit}
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
          </div>

          {/* Informação adicional */}
          <div className="text-xs text-orange-700 bg-orange-50 p-3 rounded-md border border-orange-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">Importante</p>
                <ul className="space-y-1">
                  <li>
                    • Esta ação não afetará cards que já possuem unidade
                    definida
                  </li>
                  <li>• As alterações serão salvas automaticamente</li>
                  <li>• Você pode alterar a unidade individualmente depois</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
);

DefaultUnitSelector.displayName = "DefaultUnitSelector";
