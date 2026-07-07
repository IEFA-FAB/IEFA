import type { MealKey } from "@/types/domain/meal"

export interface ScannerState {
	isReady: boolean
	isScanning: boolean
	hasPermission: boolean
	error?: string
}

export const MEAL_LABEL: Record<MealKey, string> = {
	cafe: "Café",
	almoco: "Almoço",
	janta: "Jantar",
	ceia: "Ceia",
}

/** Formata uma data no calendário LOCAL como `yyyy-mm-dd` (sem passar por UTC). */
const toLocalIsoDate = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export const generateRestrictedDates = (): string[] => {
	const today = new Date()
	const dates: string[] = []
	for (const offset of [-1, 0, 1]) {
		const d = new Date(today)
		d.setDate(today.getDate() + offset)
		// Data LOCAL: `toISOString()` converteria para UTC e, em fusos negativos (BRT),
		// à noite "hoje" vazaria para o dia seguinte — a fiscalização roda no jantar/ceia.
		dates.push(toLocalIsoDate(d))
	}
	return dates
}

export function inferDefaultMeal(now: Date = new Date()): MealKey {
	const toMin = (h: number, m = 0) => h * 60 + m
	const minutes = now.getHours() * 60 + now.getMinutes()
	const inRange = (start: number, end: number) => minutes >= start && minutes < end

	if (inRange(toMin(4), toMin(9))) return "cafe"
	if (inRange(toMin(9), toMin(15))) return "almoco"
	if (inRange(toMin(15), toMin(20))) return "janta"
	return "ceia"
}
