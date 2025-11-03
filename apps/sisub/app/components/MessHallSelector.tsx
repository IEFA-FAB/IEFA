// components/MessHallSelector.tsx (previously UnitSelector.tsx)
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
import { useMessHalls } from "./hooks/useMessHalls";

interface MessHallSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  // Prefer hasDefaultMessHall; keep hasDefaultUnit for backward compatibility
  hasDefaultMessHall?: boolean;
  hasDefaultUnit?: boolean; // deprecated, kept for compatibility during migration
  showValidation?: boolean;
  size?: "sm" | "md" | "lg";
  placeholder?: string;
}

export const MessHallSelector = memo<MessHallSelectorProps>(
  ({
    value,
    onChange,
    disabled = false,
    hasDefaultMessHall,
    hasDefaultUnit, // deprecated
    showValidation = false,
    size = "md",
    placeholder = "Selecione um rancho...",
  }) => {
    const { messHalls } = useMessHalls();

    // Unify default flag (support old prop name for now)
    const hasDefault = hasDefaultMessHall ?? hasDefaultUnit ?? false;

    // Dados memoizados
    const selectorData = useMemo(() => {
      const selectedMessHall = (messHalls ?? []).find(
        (mh) => mh.code === value
      );
      const isValidSelection = Boolean(selectedMessHall);
      const displayLabel = selectedMessHall?.name || value;

      return {
        selectedMessHall,
        isValidSelection,
        displayLabel,
      };
    }, [JSON.stringify(messHalls), value]);

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

      // Destaque opcional para rancho padrão
      const defaultTint = hasDefault ? " bg-accent/10" : "";

      // Estado inválido usa tokens destrutivos
      const invalidTint = isInvalid
        ? " border-destructive/50 bg-destructive/10"
        : "";

      const triggerClasses = `${baseTrigger} ${sizeCls}${defaultTint}${invalidTint}`;

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
      hasDefault,
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
        (messHalls ?? []).map((mh) => (
          <SelectItem
            className="cursor-pointer hover:bg-accent/50 focus:bg-accent/50 data-[state=checked]:bg-accent/60 data-[state=checked]:text-accent-foreground transition-colors"
            key={mh.code}
            value={mh.code}
          >
            <div className="flex items-center justify-between w-full">
              <span>{mh.name ?? mh.code}</span>
              {value === mh.code && (
                <Check className="h-4 w-4 text-primary ml-2" />
              )}
            </div>
          </SelectItem>
        )),
      [JSON.stringify(messHalls), value]
    );

    // Badges/indicadores à direita do label
    const indicators = useMemo(() => {
      const badges = [];

      if (hasDefault) {
        badges.push(
          <Badge key="default" variant="secondary" className="text-xs">
            Padrão
          </Badge>
        );
      }

      if (classes.isInvalid) {
        badges.push(
          <Badge key="invalid" variant="destructive" className="text-xs">
            Inválido
          </Badge>
        );
      }

      return badges;
    }, [hasDefault, classes.isInvalid]);

    const { isInvalid } = classes;
    const { isValidSelection, displayLabel } = selectorData;

    return (
      <div className={classes.container}>
        <Label className={classes.label}>
          <div className="flex items-center space-x-1">
            <MapPin className="h-4 w-4" />
            <span>Rancho:</span>
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
                  {hasDefault && (
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
              Selecione o rancho responsável
            </div>
            {selectItems}
          </SelectContent>
        </Select>

        {/* Informação adicional para rancho padrão */}
        {hasDefault && (
          <div className="text-xs text-muted-foreground flex items-center space-x-1">
            <AlertCircle className="h-3 w-3" />
            <span>Este é o rancho padrão configurado</span>
          </div>
        )}

        {/* Validação de erro */}
        {showValidation && !isValidSelection && value && (
          <div className="text-xs text-destructive flex items-center space-x-1">
            <AlertCircle className="h-3 w-3" />
            <span>Rancho não encontrado: "{value}"</span>
          </div>
        )}
      </div>
    );
  }
);

MessHallSelector.displayName = "MessHallSelector";

// Temporary alias for backward compatibility during migration.
// This allows existing imports of UnitSelector to continue working.
export const UnitSelector = MessHallSelector;

export default MessHallSelector;
