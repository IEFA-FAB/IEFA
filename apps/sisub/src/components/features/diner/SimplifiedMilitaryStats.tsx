// components/rancho/SimplifiedMilitaryStats.tsx

import { CalendarX2, CheckCircle2, MinusCircle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { DayMeals } from "@/lib/meal"

interface Selections {
	[date: string]: DayMeals
}

interface SimplifiedStatsProps {
	selections: Selections
	dates: string[]
	// Quando true, exibe skeleton no próprio componente (ex.: durante refetch)
	isLoading?: boolean
}

// Sábado (6) e domingo (0) não têm expediente — não contam como dias descobertos
const isWeekday = (dateStr: string) => {
	const dow = new Date(`${dateStr}T00:00:00`).getDay()
	return dow >= 1 && dow <= 5
}

function SimplifiedMilitaryStats({ selections, dates, isLoading = false }: SimplifiedStatsProps) {
	"use no memo"
	// Apenas os primeiros 7 dias úteis (seg–sex) da janela visível
	const next7Weekdays = dates.slice(0, 14).filter(isWeekday).slice(0, 7)

	const { daysWithMeals } = next7Weekdays.reduce(
		(acc, date) => {
			const daySelections = selections[date]
			if (daySelections && Object.values(daySelections).some(Boolean)) {
				return { daysWithMeals: acc.daysWithMeals + 1 }
			}
			return acc
		},
		{ daysWithMeals: 0 }
	)

	let nextMeal: { date: string; meal: string } | null = null
	const mealOrder = ["cafe", "almoco", "janta", "ceia"] as const

	for (let di = 0; di < dates.length; di++) {
		const date = dates[di]
		const daySelections = selections[date]
		if (daySelections) {
			for (let mi = 0; mi < mealOrder.length; mi++) {
				const meal = mealOrder[mi]
				if (daySelections[meal]) {
					nextMeal = { date, meal }
					break
				}
			}
			if (nextMeal) break
		}
	}

	const consideredDays = next7Weekdays.length || 1
	const uncoveredDays = consideredDays - daysWithMeals

	const formatDate = (dateStr: string) => {
		const [year, month, day] = dateStr.split("-").map(Number)
		const date = new Date(year, month - 1, day)
		return date.toLocaleDateString("pt-BR", {
			weekday: "short",
			day: "2-digit",
			month: "2-digit",
		})
	}

	const formatMeal = (meal: string) => {
		const mealNames = {
			cafe: "Café",
			almoco: "Almoço",
			janta: "Janta",
			ceia: "Ceia",
		}
		return mealNames[meal as keyof typeof mealNames] || meal
	}

	if (isLoading) {
		return (
			<div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" role="status" aria-busy="true" aria-label="Carregando status">
				<Skeleton className="h-4 w-44" />
				<Skeleton className="h-4 w-32" />
			</div>
		)
	}

	return (
		<div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
			{nextMeal ? (
				<span className="text-muted-foreground">
					Próxima: <span className="font-medium text-foreground">{formatMeal(nextMeal.meal)}</span>
					{" · "}
					<span>{formatDate(nextMeal.date)}</span>
				</span>
			) : (
				<span className="text-muted-foreground flex items-center gap-1.5">
					<MinusCircle className="h-3.5 w-3.5 shrink-0" />
					Nenhuma refeição agendada
				</span>
			)}

			{uncoveredDays === 0 ? (
				<span className="text-success flex items-center gap-1.5">
					<CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
					Semana coberta
				</span>
			) : (
				<span className="text-warning flex items-center gap-1.5">
					<CalendarX2 className="h-3.5 w-3.5 shrink-0" />
					{uncoveredDays} {uncoveredDays === 1 ? "dia descoberto" : "dias descobertos"}
				</span>
			)}
		</div>
	)
}

SimplifiedMilitaryStats.displayName = "SimplifiedMilitaryStats"

export default SimplifiedMilitaryStats
