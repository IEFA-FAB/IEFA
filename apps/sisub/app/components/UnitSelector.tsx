// components/UnitSelector.tsx
import { memo, useCallback, useMemo } from "react";
import { MapPin, AlertCircle, Check } from "lucide-react";
import { Label } from "@iefa/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@iefa/ui";
import { Badge } from "@iefa/ui";
import { useRancho } from "./hooks/useRancho";

interface UnidadeDisponivel {
  value: string;
  label: string;
}

interface UnitSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hasDefaultUnit?: boolean;
  showValidation?: boolean;
  size?: "sm" | "md" | "lg";
  placeholder?: string;
}

export const UnitSelector = memo<UnitSelectorProps>(
  ({
    value,
    onChange,
    disabled = false,
    hasDefaultUnit = false,
    showValidation = false,
    size = "md",
    placeholder = "Selecione uma unidade...",
  }) => {
    const { ranchos } = useRancho();

    // Dados memoizados
    const selectorData = useMemo(() => {
      const selectedUnit = ranchos.find((unit) => unit.value === value);
      const isValidSelection = Boolean(selectedUnit);
      const displayLabel = selectedUnit?.label || value;

      return {
        selectedUnit,
        isValidSelection,
        displayLabel,
      };
    }, [JSON.stringify(ranchos), value]);

    // Base de estilos de trigger alinhado ao shadcn
    const baseTrigger =
      "w-full h-10 rounded-md border border-input bg-background px-3 py-2 " +
      "text-sm text-foreground ring-offset-background " +
      "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
      "disabled:cursor-not-allowed disabled:opacity-50";

    // Classes memoizadas
    const classes = useMemo(() => {
      const sizeMap = { sm: "text-sm", md: "", lg: "text-lg" };
      const sizeCls = sizeMap[size];

      // Estados
      const isInvalid =
        showValidation && !selectorData.isValidSelection && Boolean(value);

      // Destaque opcional para unidade padrão
      const defaultUnitTint = hasDefaultUnit ? " bg-accent/10" : "";

      // Estado inválido usa tokens destrutivos
      const invalidTint = isInvalid
        ? " border-destructive/50 bg-destructive/10"
        : "";

      const triggerClasses = `${baseTrigger} ${sizeCls}${defaultUnitTint}${invalidTint}`;

      return {
        trigger: triggerClasses,
        label: `text-sm font-medium flex items-center justify-between ${
          disabled ? "text-muted-foreground" : "text-foreground"
        }`,
        container: "space-y-2",
        isInvalid,
      };
    }, [
      baseTrigger,
      disabled,
      hasDefaultUnit,
      showValidation,
      selectorData.isValidSelection,
      value,
      size,
    ]);

    // Handler memoizado
    const handleChange = useCallback(
      (newValue: string) => {
        if (disabled || newValue === value) return;
        onChange(newValue);
      },
      [disabled, value, onChange]
    );

    // Itens do select
    const selectItems = useMemo(
      () =>
        ranchos.map((unidade: UnidadeDisponivel) => (
          <SelectItem
            className="cursor-pointer hover:bg-accent/50 focus:bg-accent/50 data-[state=checked]:bg-accent/60 data-[state=checked]:text-accent-foreground transition-colors"
            key={unidade.value}
            value={unidade.value}
          >
            <div className="flex items-center justify-between w-full">
              <span>{unidade.label}</span>
              {value === unidade.value && (
                <Check className="h-4 w-4 text-primary ml-2" />
              )}
            </div>
          </SelectItem>
        )),
      [JSON.stringify(ranchos), value]
    );

    // Badges/indicadores à direita do label
    const indicators = useMemo(() => {
      const badges = [];

      if (hasDefaultUnit) {
        badges.push(
          <Badge key="default" variant="secondary" className="text-xs">
            Padrão
          </Badge>
        );
      }

      if (classes.isInvalid) {
        badges.push(
          <Badge key="invalid" variant="destructive" className="text-xs">
            Inválida
          </Badge>
        );
      }

      return badges;
    }, [hasDefaultUnit, classes.isInvalid]);

    const { isInvalid } = classes;
    const { isValidSelection, displayLabel } = selectorData;

    return (
      <div className={classes.container}>
        <Label className={classes.label}>
          <div className="flex items-center space-x-1">
            <MapPin className="h-4 w-4" />
            <span>Unidade:</span>
          </div>

          <div className="flex items-center space-x-2">
            {indicators}
            {isInvalid && <AlertCircle className="h-4 w-4 text-destructive" />}
          </div>
        </Label>

        <Select value={value} onValueChange={handleChange} disabled={disabled}>
          <SelectTrigger className={classes.trigger} aria-invalid={isInvalid}>
            <SelectValue placeholder={placeholder}>
              {value && (
                <div className="flex items-center space-x-2">
                  <span>{displayLabel}</span>
                  {hasDefaultUnit && (
                    <Badge variant="secondary" className="text-xs">
                      Padrão
                    </Badge>
                  )}
                </div>
              )}
            </SelectValue>
          </SelectTrigger>

          <SelectContent className="max-h-60">
            <div className="p-2 text-xs text-muted-foreground border-b border-border">
              Selecione a unidade responsável
            </div>
            {selectItems}
          </SelectContent>
        </Select>

        {/* Informação adicional para unidade padrão */}
        {hasDefaultUnit && (
          <div className="text-xs text-muted-foreground flex items-center space-x-1">
            <AlertCircle className="h-3 w-3" />
            <span>Esta é a unidade padrão configurada</span>
          </div>
        )}

        {/* Validação de erro */}
        {showValidation && !isValidSelection && value && (
          <div className="text-xs text-destructive flex items-center space-x-1">
            <AlertCircle className="h-3 w-3" />
            <span>Unidade não encontrada: "{value}"</span>
          </div>
        )}
      </div>
    );
  }
);

UnitSelector.displayName = "UnitSelector";
