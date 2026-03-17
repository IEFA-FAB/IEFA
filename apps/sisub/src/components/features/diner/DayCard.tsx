// components/DayCard.tsx

import { Eraser, PaintBucket } from "lucide-react"
import type { ReactNode } from "react"
import { MealButton } from "@/components/features/diner/MealButton"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { MEAL_TYPES } from "@/constants/rancho"
import type { DishDetails } from "@/hooks/data/useDailyMenuContent"
import { useMessHalls } from "@/hooks/data/useMessHalls"
import { cn } from "@/lib/cn"
import type { DayMeals, PendingChange } from "@/types/domain/meal"

const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

// 0=Dom, 1=Seg, ..., 5=Sex, 6=Sáb
function getDayOfWeekColor(dateStr: string): string {
	const [year, month, day] = dateStr.split("-").map(Number)
	const dow = new Date(year, month - 1, day).getDay()
	if (dow === 0 || dow === 6) return "text-warning" // fim de semana
	if (dow === 5) return "text-success" // sexta
	return "text-primary" // seg–qui
}

interface DayCardProps {
	date: string
	daySelections: DayMeals
	dayMessHallId: string
	defaultMessHallId: string
	onMealToggle: (date: string, meal: keyof DayMeals) => void
	onMessHallChange: (date: string, newMessHallId: string) => void
	formattedDate: string
	dayOfWeek: string
	isToday: boolean
	isDateNear: boolean
	pendingChanges: PendingChange[]
	isSaving?: boolean
	selectedMealsCount?: number
	dishes?: { [mealKey: string]: DishDetails[] }
}

const countSelectedMeals = (daySelections: DayMeals): number => {
	return Object.values(daySelections).filter(Boolean).length
}

// Semantic wrapper — owns all graphic state logic for DayCard.
// Candidate for extraction to src/components/common/ if reused across 3+ surfaces.
interface DayCardShellProps {
	isToday: boolean
	hasPendingChanges: boolean
	isDateNear: boolean
	isFull: boolean
	hasPartialSelection: boolean
	isEmpty: boolean
	children: ReactNode
}

function DayCardShell({ isToday, hasPendingChanges, isDateNear, isFull, hasPartialSelection, isEmpty, children }: DayCardShellProps) {
	return (
		<Card
			className={cn("w-80 flex-shrink-0 transition-opacity duration-200 relative", {
				"ring-2 ring-primary bg-primary/5": isToday,
				"ring-1 ring-accent bg-accent/10": hasPendingChanges && !isToday,
				"opacity-75": isDateNear && !isToday,
				"bg-primary/10 border-primary/40": isFull && !isToday,
				"bg-secondary/10 border-secondary/40": hasPartialSelection && !isToday && !hasPendingChanges,
				"bg-muted/10 border-border": isEmpty && !isToday && !hasPendingChanges,
			})}
		>
			{children}
		</Card>
	)
}


function DayCard({
	date,
	daySelections,
	dayMessHallId,
	defaultMessHallId: _defaultMessHallId,
	onMealToggle,
	onMessHallChange,
	formattedDate: _formattedDate,
	dayOfWeek,
	isToday,
	isDateNear,
	pendingChanges,
	isSaving = false,
	selectedMealsCount,
	dishes,
}: DayCardProps) {
	const { messHalls } = useMessHalls()
	const hasPendingChanges = pendingChanges.some((change) => change.date === date)
	const selectedCount = selectedMealsCount ?? countSelectedMeals(daySelections)

	const cardState = {
		hasPendingChanges,
		selectedCount,
		isEmpty: selectedCount === 0,
		isFull: selectedCount === 4,
		hasPartialSelection: selectedCount > 0 && selectedCount < 4,
	}

	const handleMealToggle = (meal: keyof DayMeals) => {
		onMealToggle(date, meal)
	}

	const handleMessHallChange = (newMessHallId: string) => {
		onMessHallChange(date, newMessHallId)
	}

	const isDisabled = isSaving || isDateNear

	const [, monthStr, dayStr] = date.split("-")
	const dayNumber = parseInt(dayStr, 10)
	const monthAbbr = MONTH_ABBR[parseInt(monthStr, 10) - 1]
	const dayOfWeekShort = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1, 3)

	const selectAllMeals = () => {
		MEAL_TYPES.forEach((meal) => {
			const mealKey = meal.value as keyof DayMeals
			if (!daySelections[mealKey]) handleMealToggle(mealKey)
		})
	}

	const clearAllMeals = () => {
		MEAL_TYPES.forEach((meal) => {
			const mealKey = meal.value as keyof DayMeals
			if (daySelections[mealKey]) handleMealToggle(mealKey)
		})
	}

	return (
		<DayCardShell
			isToday={isToday}
			hasPendingChanges={cardState.hasPendingChanges}
			isDateNear={isDateNear}
			isFull={cardState.isFull}
			hasPartialSelection={cardState.hasPartialSelection}
			isEmpty={cardState.isEmpty}
		>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-center gap-3">
					<div className="flex flex-col items-end">
						<span className="text-5xl font-bold leading-none text-foreground">{dayNumber}</span>
						<span className="text-xs text-muted-foreground uppercase tracking-wide">{monthAbbr}</span>
					</div>
					<Separator orientation="vertical" className="h-12" />
					<div className="flex items-center">
						<span className={cn("text-4xl font-bold", getDayOfWeekColor(date))}>{dayOfWeekShort}</span>
					</div>
				</div>
			</CardHeader>

			<CardContent className="flex flex-col gap-3">
				{/* Mess hall selector + action icon buttons */}
				<div className="flex items-center gap-2">
					<Select
						value={dayMessHallId}
						onValueChange={(v) => {
							if (v && v !== dayMessHallId) handleMessHallChange(v)
						}}
						disabled={isDisabled}
					>
						<SelectTrigger className="flex-1">
							<SelectValue placeholder="Selecione um rancho..." />
						</SelectTrigger>
						<SelectContent>
							{messHalls?.map((mh) => (
								<SelectItem key={mh.code} value={mh.code}>
									{mh.display_name ?? mh.code}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Tooltip>
						<TooltipTrigger
							render={<Button variant="outline" size="icon-sm" onClick={selectAllMeals} disabled={isDisabled} aria-label="Selecionar todas as refeições" />}
						>
							<PaintBucket />
						</TooltipTrigger>
						<TooltipContent>Selecionar todas</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger
							render={<Button variant="outline" size="icon-sm" onClick={clearAllMeals} disabled={isDisabled} aria-label="Limpar todas as refeições" />}
						>
							<Eraser />
						</TooltipTrigger>
						<TooltipContent>Limpar tudo</TooltipContent>
					</Tooltip>
				</div>

				{/* Meals grid 2x2 */}
				<div className="grid grid-cols-2 gap-2">
					{MEAL_TYPES.map((meal) => {
						const mealKey = meal.value as keyof DayMeals
						const mealDishes = dishes?.[mealKey]

						return (
							<MealButton
								key={meal.value}
								meal={meal}
								isSelected={daySelections[mealKey]}
								onToggle={() => handleMealToggle(mealKey)}
								disabled={isDisabled}
								compact={true}
								dishes={mealDishes}
							/>
						)
					})}
				</div>
			</CardContent>
		</DayCardShell>
	)
}

export const useDayCardData = (
	date: string,
	todayString: string,
	isDateNear: (date: string) => boolean,
	formatDate: (date: string) => string,
	getDayOfWeek: (date: string) => string,
	daySelections: DayMeals,
	pendingChanges: PendingChange[]
) => {
	const selectedMealsCount = countSelectedMeals(daySelections)
	const hasPendingChanges = pendingChanges.some((change) => change.date === date)

	return {
		formattedDate: formatDate(date),
		dayOfWeek: getDayOfWeek(date),
		selectedMealsCount,
		isDateNear: isDateNear(date),
		isToday: date === todayString,
		hasPendingChanges,
		isEmpty: selectedMealsCount === 0,
		isFull: selectedMealsCount === 4,
		hasPartialSelection: selectedMealsCount > 0 && selectedMealsCount < 4,
	}
}

export const useDayCardOptimization = (dates: string[], selections: Record<string, DayMeals>) => {
	const optimizedData: Record<string, { selectedCount: number; isEmpty: boolean; isFull: boolean }> = {}

	dates.forEach((date) => {
		const daySelections = selections[date]
		const selectedCount = daySelections ? countSelectedMeals(daySelections) : 0

		optimizedData[date] = {
			selectedCount,
			isEmpty: selectedCount === 0,
			isFull: selectedCount === 4,
		}
	})

	return optimizedData
}

export default DayCard
