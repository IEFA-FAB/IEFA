import { Calendar, Utensils, Check, AlertCircle } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@iefa/ui";
import { Label } from "@iefa/ui"
import { Badge } from "@iefa/ui";
import { UnitSelector } from "~/components/UnitSelector";
import { MEAL_LABEL, MealKey } from "~/utils/FiscalUtils";
import { formatDate } from "~/utils/RanchoUtils";

interface FiltersProps {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedMeal: MealKey;
  setSelectedMeal: (meal: MealKey) => void;
  selectedUnit: string;
  setSelectedUnit: (unit: string) => void;
  dates: string[];
}
export default function Filters({
  selectedDate,
  setSelectedDate,
  selectedMeal,
  setSelectedMeal,
  selectedUnit,
  setSelectedUnit,
  dates,
}: FiltersProps) {
  return (
    <>
      <div className="flex-1">
        {(() => {
          const isValidDate = !selectedDate || dates.includes(selectedDate);
          const size: "sm" | "md" | "lg" = "md";
          const disabled = false;
          const base = "w-full transition-all duration-200";
          const sizeMap = { sm: "text-sm", md: "", lg: "text-lg" };
          let trigger = `${base} ${sizeMap[size]}`;

          if (disabled) {
            trigger += " cursor-not-allowed opacity-60";
          } else {
            trigger += " cursor-pointer hover:border-gray-400";
          }
          // Azul como padrão, vermelho em erro (igual UnitSelector)
          trigger += " focus:border-blue-400 focus:ring-blue-200";
          if (selectedDate && !isValidDate) {
            trigger += " border-red-300 bg-red-50";
          }

          const labelCls = `text-sm font-medium flex items-center justify-between ${
            disabled ? "text-gray-500" : "text-gray-700"
          }`;

          return (
            <div className="space-y-2">
              <Label className={labelCls}>
                <div className="flex items-center space-x-1">
                  <Calendar className="h-4 w-4" />
                  <span>Dia:</span>
                </div>
                <div className="flex items-center space-x-2">
                  {selectedDate && !isValidDate && (
                    <>
                      <Badge
                        variant="outline"
                        className="text-xs text-red-600 border-red-300 bg-red-50"
                      >
                        Inválido
                      </Badge>
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    </>
                  )}
                </div>
              </Label>

              <Select
                value={selectedDate}
                onValueChange={(v) => setSelectedDate(v)}
                disabled={disabled}
              >
                <SelectTrigger className={trigger}>
                  <SelectValue placeholder="Selecione o dia">
                    {selectedDate && (
                      <div className="flex items-center space-x-2">
                        <span>{formatDate(selectedDate)}</span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>

                <SelectContent className="max-h-60">
                  <div className="p-2 text-xs text-gray-500 border-b">
                    Selecione o dia do cardápio
                  </div>
                  {dates.map((d) => {
                    const selected = d === selectedDate;
                    return (
                      <SelectItem
                        className="cursor-pointer hover:bg-gray-50 focus:bg-gray-50 transition-colors"
                        value={d}
                        key={d}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>{formatDate(d)}</span>
                          {selected && (
                            <Check className="h-4 w-4 text-green-600 ml-2" />
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {selectedDate && !isValidDate && (
                <div className="text-xs text-red-600 flex items-center space-x-1">
                  <AlertCircle className="h-3 w-3" />
                  <span>Data inválida selecionada</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <div className="flex-1">
        {(() => {
          const mealKeys = Object.keys(MEAL_LABEL) as MealKey[];
          const isValidMeal = !selectedMeal || mealKeys.includes(selectedMeal);
          const size: "sm" | "md" | "lg" = "md";
          const disabled = false;
          const base = "w-full transition-all duration-200";
          const sizeMap = { sm: "text-sm", md: "", lg: "text-lg" };
          let trigger = `${base} ${sizeMap[size]}`;

          if (disabled) {
            trigger += " cursor-not-allowed opacity-60";
          } else {
            trigger += " cursor-pointer hover:border-gray-400";
          }
          trigger += " focus:border-blue-400 focus:ring-blue-200";
          if (selectedMeal && !isValidMeal) {
            trigger += " border-red-300 bg-red-50";
          }

          const labelCls = `text-sm font-medium flex items-center justify-between ${
            disabled ? "text-gray-500" : "text-gray-700"
          }`;

          return (
            <div className="space-y-2">
              <Label className={labelCls}>
                <div className="flex items-center space-x-1">
                  <Utensils className="h-4 w-4" />
                  <span>Refeição:</span>
                </div>
                <div className="flex items-center space-x-2">
                  {selectedMeal && !isValidMeal && (
                    <>
                      <Badge
                        variant="outline"
                        className="text-xs text-red-600 border-red-300 bg-red-50"
                      >
                        Inválida
                      </Badge>
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    </>
                  )}
                </div>
              </Label>

              <Select
                value={selectedMeal}
                onValueChange={(v) => {
                  console.log("Refeição selecionada:", v);
                  setSelectedMeal(v as MealKey);
                }}
                disabled={disabled}
              >
                <SelectTrigger className={trigger}>
                  <SelectValue placeholder="Selecione a refeição">
                    {selectedMeal && (
                      <div className="flex items-center space-x-2">
                        <span>{MEAL_LABEL[selectedMeal]}</span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>

                <SelectContent className="max-h-60">
                  <div className="p-2 text-xs text-gray-500 border-b">
                    Selecione o tipo de refeição
                  </div>
                  {mealKeys.map((k) => {
                    const selected = k === selectedMeal;
                    return (
                      <SelectItem
                        className="cursor-pointer hover:bg-gray-50 focus:bg-gray-50 transition-colors"
                        value={k}
                        key={k}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>{MEAL_LABEL[k]}</span>
                          {selected && (
                            <Check className="h-4 w-4 text-green-600 ml-2" />
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {selectedMeal && !isValidMeal && (
                <div className="text-xs text-red-600 flex items-center space-x-1">
                  <AlertCircle className="h-3 w-3" />
                  <span>Refeição inválida selecionada</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="w-full sm:w-64">
            <UnitSelector
              value={selectedUnit}
              onChange={setSelectedUnit}
              placeholder="Selecione a OM..."
            />
          </div>
        </div>
      </div>
    </>
  );
}
