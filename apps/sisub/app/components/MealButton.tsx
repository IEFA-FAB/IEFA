// components/MealButton.tsx
import { memo } from "react";
import { type LucideIcon, Check, X } from "lucide-react";
import { cn } from "~/utils/utils";

interface Meal {
  icon: LucideIcon;
  label: string;
  value: string;
}

interface MealButtonProps {
  meal: Meal;
  isSelected: boolean;
  onToggle: () => void;
  disabled: boolean;
  compact?: boolean;
}

export const MealButton = memo<MealButtonProps>(
  ({ meal, isSelected, onToggle, disabled, compact = false }) => {
    const Icon = meal.icon;

    const buttonClasses = cn(
      "w-full rounded-lg border-2 transition-all duration-200 group",
      "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
      {
        // Estados selecionado/não selecionado
        "border-green-500 bg-green-50 text-green-900": isSelected,
        "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50":
          !isSelected,

        // Estados de interação
        "cursor-pointer active:scale-95 hover:shadow-sm": !disabled,
        "opacity-50 cursor-not-allowed": disabled,

        // Tamanhos
        "p-2": compact,
        "p-3": !compact,
      }
    );

    const iconClasses = cn("transition-colors duration-200", {
      "h-4 w-4": compact,
      "h-5 w-5": !compact,
      "text-green-600": isSelected,
      "text-gray-500 group-hover:text-gray-600": !isSelected && !disabled,
    });

    if (compact) {
      return (
        <button
          onClick={onToggle}
          disabled={disabled}
          className={buttonClasses}
          title={`${meal.label} - ${isSelected ? "Confirmado" : "Não vai"}`}
        >
          <div className="flex flex-col items-center space-y-1">
            <Icon className={iconClasses} />
            <span className="text-xs font-medium truncate w-full text-center">
              {meal.label}
            </span>

            {/* Indicador visual simples */}
            <div
              className={cn(
                "w-2 h-2 rounded-full transition-colors duration-200",
                isSelected ? "bg-green-500" : "bg-gray-300"
              )}
            />
          </div>
        </button>
      );
    }

    return (
      <button onClick={onToggle} disabled={disabled} className={buttonClasses}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Icon className={iconClasses} />
            <span className="font-medium">{meal.label}</span>
          </div>

          {/* Status icon mais limpo */}
          <div
            className={cn(
              "flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200",
              {
                "bg-green-500 text-white": isSelected,
                "bg-gray-200 text-gray-500": !isSelected,
              }
            )}
          >
            {isSelected ? (
              <Check className="h-3 w-3" />
            ) : (
              <X className="h-3 w-3" />
            )}
          </div>
        </div>
      </button>
    );
  }
);

MealButton.displayName = "MealButton";
