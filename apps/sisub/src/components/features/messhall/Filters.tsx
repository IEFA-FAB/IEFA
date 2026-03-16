import { AlertCircle, Calendar, Check, Utensils } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/cn"
import { MEAL_LABEL } from "@/lib/fiscal"
import { formatDate } from "@/lib/meal"
import type { MealKey } from "@/types/domain/meal"

interface FiltersProps {
	selectedDate: string
	setSelectedDate: (date: string) => void
	selectedMeal: MealKey
	setSelectedMeal: (meal: MealKey) => void
	dates: string[]
}

export default function Filters({ selectedDate, setSelectedDate, selectedMeal, setSelectedMeal, dates }: FiltersProps) {
	const baseTrigger =
		"w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background " +
		"placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
		"disabled:cursor-not-allowed disabled:opacity-50"

	return (
		<>
			{/* Dia */}
			<div className="flex-1">
				{(() => {
					const isValidDate = !selectedDate || dates.includes(selectedDate)
					const isInvalid = Boolean(selectedDate && !isValidDate)

					return (
						<div className="space-y-2">
							<Label className="text-sm font-medium flex items-center justify-between text-foreground">
								<div className="flex items-center space-x-1">
									<Calendar className="h-4 w-4" />
									<span>Dia:</span>
								</div>
								{isInvalid && (
									<div className="flex items-center space-x-2">
										<Badge variant="destructive" className="text-xs">
											Inválido
										</Badge>
										<AlertCircle className="h-4 w-4 text-destructive" />
									</div>
								)}
							</Label>

							<Select value={selectedDate} onValueChange={(v) => setSelectedDate(v ?? "")}>
								<SelectTrigger className={cn(baseTrigger, isInvalid && "border-destructive/50 bg-destructive/10")} aria-invalid={isInvalid}>
									<SelectValue placeholder="Selecione o dia">{selectedDate && <span>{formatDate(selectedDate)}</span>}</SelectValue>
								</SelectTrigger>
								<SelectContent className="max-h-60">
									<div className="p-2 text-xs text-muted-foreground border-b border-border">Selecione o dia do cardápio</div>
									{dates.map((d) => (
										<SelectItem className="cursor-pointer hover:bg-accent/50 focus:bg-accent/50 transition-colors" value={d} key={d}>
											<div className="flex items-center justify-between w-full">
												<span>{formatDate(d)}</span>
												{d === selectedDate && <Check className="h-4 w-4 text-primary ml-2" />}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							{isInvalid && (
								<div className="text-xs text-destructive flex items-center space-x-1">
									<AlertCircle className="h-3 w-3" />
									<span>Data inválida selecionada</span>
								</div>
							)}
						</div>
					)
				})()}
			</div>

			{/* Refeição */}
			<div className="flex-1">
				{(() => {
					const mealKeys = Object.keys(MEAL_LABEL) as MealKey[]
					const isInvalid = Boolean(selectedMeal && !mealKeys.includes(selectedMeal))

					return (
						<div className="space-y-2">
							<Label className="text-sm font-medium flex items-center justify-between text-foreground">
								<div className="flex items-center space-x-1">
									<Utensils className="h-4 w-4" />
									<span>Refeição:</span>
								</div>
								{isInvalid && (
									<div className="flex items-center space-x-2">
										<Badge variant="destructive" className="text-xs">
											Inválida
										</Badge>
										<AlertCircle className="h-4 w-4 text-destructive" />
									</div>
								)}
							</Label>

							<Select value={selectedMeal} onValueChange={(v) => setSelectedMeal(v as MealKey)}>
								<SelectTrigger className={cn(baseTrigger, isInvalid && "border-destructive/50 bg-destructive/10")} aria-invalid={isInvalid}>
									<SelectValue placeholder="Selecione a refeição">{selectedMeal && <span>{MEAL_LABEL[selectedMeal]}</span>}</SelectValue>
								</SelectTrigger>
								<SelectContent className="max-h-60">
									<div className="p-2 text-xs text-muted-foreground border-b border-border">Selecione o tipo de refeição</div>
									{mealKeys.map((k) => (
										<SelectItem className="cursor-pointer hover:bg-accent/50 focus:bg-accent/50 transition-colors" value={k} key={k}>
											<div className="flex items-center justify-between w-full">
												<span>{MEAL_LABEL[k]}</span>
												{k === selectedMeal && <Check className="h-4 w-4 text-primary ml-2" />}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							{isInvalid && (
								<div className="text-xs text-destructive flex items-center space-x-1">
									<AlertCircle className="h-3 w-3" />
									<span>Refeição inválida selecionada</span>
								</div>
							)}
						</div>
					)
				})()}
			</div>
		</>
	)
}
