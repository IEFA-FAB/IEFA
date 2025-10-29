// components/DefaultUnitSelector.tsx
import { memo, useCallback, useMemo } from "react";
import { Settings, CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Label,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
} from "@iefa/ui";
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

    // Dados computados
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

    // Itens do select
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
          key={rancho.value}
          value={rancho.value}
          className="
            cursor-pointer
            data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground
            focus:bg-accent/20
          "
        >
          {rancho.label}
        </SelectItem>
      ));
    }, [ranchos]);

    const { cardsCount, hasCardsToApply, selectedUnitLabel, hasUnits } =
      selectorData;

    return (
      <Card
        className="
          group relative overflow-hidden rounded-2xl
          bg-card text-card-foreground border border-border
          shadow-sm transition-all duration-300 hover:shadow-md hover:border-accent
        "
      >
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
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-foreground">
              <span className="flex items-center gap-2">
                <span
                  className="
                    inline-flex items-center justify-center h-8 w-8 rounded-lg
                    bg-background text-foreground ring-1 ring-border
                  "
                >
                  <Settings className="h-4.5 w-4.5" />
                </span>
                <span className="font-semibold">Configurar Unidade Padrão</span>
              </span>
            </CardTitle>

            <Badge
              variant="outline"
              className={
                cardsCount > 0
                  ? "border-accent text-accent"
                  : "border-border text-muted-foreground"
              }
            >
              {cardsCount} card{cardsCount !== 1 ? "s" : ""}
            </Badge>
          </div>

          <CardDescription className="mt-3">
            <div
              className="
                flex gap-2 rounded-md border p-2.5
                bg-accent/10 text-accent-foreground border-accent/30
              "
            >
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
            <Label className="text-sm font-medium text-foreground">
              Selecione a unidade padrão:
            </Label>

            <Select
              value={defaultUnit}
              onValueChange={handleUnitChange}
              disabled={isApplying || !hasUnits}
            >
              <SelectTrigger
                className="
                  w-full cursor-pointer
                  bg-background border border-border
                  focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
                  hover:border-accent
                "
              >
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
              <div
                className="
                  flex items-center gap-2 text-xs rounded-md border p-2
                  bg-muted text-muted-foreground border-border
                "
              >
                <CheckCircle className="h-3.5 w-3.5" />
                <span>
                  Unidade selecionada:{" "}
                  <strong className="text-foreground">
                    {selectedUnitLabel}
                  </strong>
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div
                className={[
                  "text-sm flex items-center gap-2",
                  hasCardsToApply ? "text-foreground" : "text-muted-foreground",
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
                  className="
                    hover:bg-muted
                    focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
                  "
                >
                  Cancelar
                </Button>

                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={isApplying || !hasCardsToApply || !defaultUnit}
                  className="
                    bg-primary text-primary-foreground hover:bg-primary/90
                    focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
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
          </div>

          {/* Informação adicional */}
          <div
            className="
              text-xs rounded-md border p-3
              bg-muted text-muted-foreground border-border
            "
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Importante</p>
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
