import { Calendar, Utensils, Check, AlertCircle } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@iefa/ui";
import { Label } from "@iefa/ui";
import { Badge } from "@iefa/ui";
import { UnitSelector } from "~/components/MessHallSelector";
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
    // Estilos base de trigger alinhados ao tema shadcn
    const baseTrigger =
        "w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background " +
        "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
        "disabled:cursor-not-allowed disabled:opacity-50";

    return (
        <>
            {/* Dia */}
            <div className="flex-1">
                {(() => {
                    const isValidDate = !selectedDate || dates.includes(selectedDate);
                    const disabled = false;
                    const isInvalid = Boolean(selectedDate && !isValidDate);

                    const labelCls = `text-sm font-medium flex items-center justify-between ${
                        disabled ? "text-muted-foreground" : "text-foreground"
                    }`;

                    return (
                        <div className="space-y-2">
                            <Label className={labelCls}>
                                <div className="flex items-center space-x-1">
                                    <Calendar className="h-4 w-4" />
                                    <span>Dia:</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    {isInvalid && (
                                        <>
                                            <Badge variant="destructive" className="text-xs">
                                                Inválido
                                            </Badge>
                                            <AlertCircle className="h-4 w-4 text-destructive" />
                                        </>
                                    )}
                                </div>
                            </Label>

                            <Select value={selectedDate} onValueChange={(v) => setSelectedDate(v)} disabled={disabled}>
                                <SelectTrigger
                                    className={`${baseTrigger} ${
                                        isInvalid ? "border-destructive/50 bg-destructive/10" : ""
                                    }`}
                                    aria-invalid={isInvalid}
                                >
                                    <SelectValue placeholder="Selecione o dia">
                                        {selectedDate && (
                                            <div className="flex items-center space-x-2">
                                                <span>{formatDate(selectedDate)}</span>
                                            </div>
                                        )}
                                    </SelectValue>
                                </SelectTrigger>

                                <SelectContent className="max-h-60">
                                    <div className="p-2 text-xs text-muted-foreground border-b border-border">
                                        Selecione o dia do cardápio
                                    </div>
                                    {dates.map((d) => {
                                        const selected = d === selectedDate;
                                        return (
                                            <SelectItem
                                                className="cursor-pointer hover:bg-accent/50 focus:bg-accent/50 transition-colors"
                                                value={d}
                                                key={d}
                                            >
                                                <div className="flex items-center justify-between w-full">
                                                    <span>{formatDate(d)}</span>
                                                    {selected && <Check className="h-4 w-4 text-primary ml-2" />}
                                                </div>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>

                            {isInvalid && (
                                <div className="text-xs text-destructive flex items-center space-x-1">
                                    <AlertCircle className="h-3 w-3" />
                                    <span>Data inválida selecionada</span>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* Refeição */}
            <div className="flex-1">
                {(() => {
                    const mealKeys = Object.keys(MEAL_LABEL) as MealKey[];
                    const isValidMeal = !selectedMeal || mealKeys.includes(selectedMeal);
                    const disabled = false;
                    const isInvalid = Boolean(selectedMeal && !isValidMeal);

                    const labelCls = `text-sm font-medium flex items-center justify-between ${
                        disabled ? "text-muted-foreground" : "text-foreground"
                    }`;

                    return (
                        <div className="space-y-2">
                            <Label className={labelCls}>
                                <div className="flex items-center space-x-1">
                                    <Utensils className="h-4 w-4" />
                                    <span>Refeição:</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    {isInvalid && (
                                        <>
                                            <Badge variant="destructive" className="text-xs">
                                                Inválida
                                            </Badge>
                                            <AlertCircle className="h-4 w-4 text-destructive" />
                                        </>
                                    )}
                                </div>
                            </Label>

                            <Select
                                value={selectedMeal}
                                onValueChange={(v) => setSelectedMeal(v as MealKey)}
                                disabled={disabled}
                            >
                                <SelectTrigger
                                    className={`${baseTrigger} ${
                                        isInvalid ? "border-destructive/50 bg-destructive/10" : ""
                                    }`}
                                    aria-invalid={isInvalid}
                                >
                                    <SelectValue placeholder="Selecione a refeição">
                                        {selectedMeal && (
                                            <div className="flex items-center space-x-2">
                                                <span>{MEAL_LABEL[selectedMeal]}</span>
                                            </div>
                                        )}
                                    </SelectValue>
                                </SelectTrigger>

                                <SelectContent className="max-h-60">
                                    <div className="p-2 text-xs text-muted-foreground border-b border-border">
                                        Selecione o tipo de refeição
                                    </div>
                                    {mealKeys.map((k) => {
                                        const selected = k === selectedMeal;
                                        return (
                                            <SelectItem
                                                className="cursor-pointer hover:bg-accent/50 focus:bg-accent/50 transition-colors"
                                                value={k}
                                                key={k}
                                            >
                                                <div className="flex items-center justify-between w-full">
                                                    <span>{MEAL_LABEL[k]}</span>
                                                    {selected && <Check className="h-4 w-4 text-primary ml-2" />}
                                                </div>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>

                            {isInvalid && (
                                <div className="text-xs text-destructive flex items-center space-x-1">
                                    <AlertCircle className="h-3 w-3" />
                                    <span>Refeição inválida selecionada</span>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* OM */}
            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <div className="w-full sm:w-64">
                        <UnitSelector value={selectedUnit} onChange={setSelectedUnit} placeholder="Selecione a OM..." />
                    </div>
                </div>
            </div>
        </>
    );
}
