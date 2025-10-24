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
    // Memoizar dados computados
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

    // Memoizar classes CSS baseadas nas props
    const classes = useMemo(() => {
      const baseClasses = "w-full transition-all duration-200";
      const sizeClasses = {
        sm: "text-sm",
        md: "",
        lg: "text-lg",
      };

      let triggerClasses = `${baseClasses} ${sizeClasses[size]}`;

      if (disabled) {
        triggerClasses += " cursor-not-allowed opacity-60";
      } else {
        triggerClasses += " cursor-pointer hover:border-gray-400";
      }

      if (hasDefaultUnit) {
        triggerClasses +=
          " border-orange-200 bg-orange-50 focus:border-orange-400 focus:ring-orange-200";
      } else {
        triggerClasses += " focus:border-blue-400 focus:ring-blue-200";
      }

      if (showValidation && !selectorData.isValidSelection && value) {
        triggerClasses += " border-red-300 bg-red-50";
      }

      return {
        trigger: triggerClasses,
        label: `text-sm font-medium flex items-center space-x-2 ${
          disabled ? "text-gray-500" : "text-gray-700"
        }`,
        container: "space-y-2",
      };
    }, [
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

    // Memoizar itens do select
    const selectItems = useMemo(
      () =>
        ranchos.map((unidade: UnidadeDisponivel) => (
          <SelectItem
            className="cursor-pointer hover:bg-gray-50 focus:bg-gray-50 transition-colors"
            key={unidade.value}
            value={unidade.value}
          >
            <div className="flex items-center justify-between w-full">
              <span>{unidade.label}</span>
              {value === unidade.value && (
                <Check className="h-4 w-4 text-green-600 ml-2" />
              )}
            </div>
          </SelectItem>
        )),
      [JSON.stringify(ranchos), value]
    );

    // Memoizar badges e indicadores
    const indicators = useMemo(() => {
      const badges = [];

      if (hasDefaultUnit) {
        badges.push(
          <Badge
            key="default"
            variant="outline"
            className="text-xs text-orange-600 border-orange-300 bg-orange-50"
          >
            Padrão
          </Badge>
        );
      }

      if (showValidation && !selectorData.isValidSelection && value) {
        badges.push(
          <Badge
            key="invalid"
            variant="outline"
            className="text-xs text-red-600 border-red-300 bg-red-50"
          >
            Inválida
          </Badge>
        );
      }

      return badges;
    }, [hasDefaultUnit, showValidation, selectorData.isValidSelection, value]);

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
            {showValidation && !isValidSelection && value && (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
          </div>
        </Label>

        <Select value={value} onValueChange={handleChange} disabled={disabled}>
          <SelectTrigger className={classes.trigger}>
            <SelectValue placeholder={placeholder}>
              {value && (
                <div className="flex items-center space-x-2">
                  <span>{displayLabel}</span>
                  {hasDefaultUnit && (
                    <Badge
                      variant="outline"
                      className="text-xs text-orange-600 border-orange-300"
                    >
                      Padrão
                    </Badge>
                  )}
                </div>
              )}
            </SelectValue>
          </SelectTrigger>

          <SelectContent className="max-h-60">
            <div className="p-2 text-xs text-gray-500 border-b">
              Selecione a unidade responsável
            </div>
            {selectItems}
          </SelectContent>
        </Select>

        {/* Informação adicional para unidade padrão */}
        {hasDefaultUnit && (
          <div className="text-xs text-orange-600 flex items-center space-x-1">
            <AlertCircle className="h-3 w-3" />
            <span>Esta é a unidade padrão configurada</span>
          </div>
        )}

        {/* Validação de erro */}
        {showValidation && !isValidSelection && value && (
          <div className="text-xs text-red-600 flex items-center space-x-1">
            <AlertCircle className="h-3 w-3" />
            <span>Unidade não encontrada: "{value}"</span>
          </div>
        )}
      </div>
    );
  }
);

UnitSelector.displayName = "UnitSelector";
