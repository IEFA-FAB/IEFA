import { formatDate, getDayOfWeek, isDateNear } from "@/lib/meal"
import type { DayMeals } from "@/types/domain/meal"

/** Pluralização simples pt-BR */
export const pluralize = (count: number, singular: string, plural: string) => (count === 1 ? singular : plural)

export const labelAlteracao = (n: number) => pluralize(n, "alteração", "alterações")
export const labelCard = (n: number) => pluralize(n, "card", "cards")
export const labelDiaUtil = (n: number) => pluralize(n, "dia útil", "dias úteis")

/** Verifica se a data cai em dia útil (segunda a sexta) */
export function isWeekday(dateString: string): boolean {
	const d = new Date(`${dateString}T00:00:00`)
	const dow = d.getDay() // 0=Dom, 1=Seg, ..., 6=Sáb
	return dow >= 1 && dow <= 5
}

/** Dados derivados para um DayCard na tela de previsão */
export function getDayCardData(date: string, todayString: string, daySelections: DayMeals, nearDateThreshold: number) {
	const formattedDate = formatDate(date)
	const dayOfWeek = getDayOfWeek(date)
	const selectedMealsCount = Object.values(daySelections).filter(Boolean).length
	const isDateNearValue = isDateNear(date, nearDateThreshold)
	const isToday = date === todayString

	return {
		formattedDate,
		dayOfWeek,
		selectedMealsCount,
		isDateNear: isDateNearValue,
		isToday,
	}
}
