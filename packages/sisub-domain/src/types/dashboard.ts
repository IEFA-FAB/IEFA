import type { MealKey } from "./meal.ts"

export interface ForecastRecord {
	user_id: string
	date: string
	meal: MealKey
	will_eat: boolean
	mess_hall_id: number
	created_at: string
	updated_at: string
}

export interface DashboardPresenceRecord {
	user_id: string
	date: string
	meal: MealKey
	mess_hall_id: number
	created_at: string
	updated_at: string
}

export interface MessHallAPI {
	id: number
	unit_id: number
	code: string
	display_name: string
}

export interface UnitAPI {
	id: number
	code: string
	display_name: string
}

export interface UserDataAPI {
	id: string
	created_at: string
	email: string
	nrOrdem: string | null
}

export interface UserMilitaryDataAPI {
	nrOrdem: string
	nrCpf: string
	nmGuerra: string | null
	nmPessoa: string | null
	sgPosto: string | null
	sgOrg: string | null
	dataAtualizacao: string
}

export interface MealTypeStat {
	meal: MealKey
	forecast: number
	presence: number
	percentage: number
}

export interface DailyMealStat {
	date: string
	cafe: number
	almoco: number
	janta: number
	ceia: number
}

export interface MessHallStats {
	mess_hall_id: number
	mess_hall_name: string
	total_forecast: number
	total_presence: number
	by_meal: MealTypeStat[]
}

export interface DashboardMetrics {
	total_forecast: number
	total_presence: number
	by_meal_type: MealTypeStat[]
	daily_distribution: DailyMealStat[]
	by_mess_hall: MessHallStats[]
}

export interface PersonDetail {
	id: string
	name: string | null
	posto: string | null
	org: string | null
	email: string
}

export interface UserMealDetail {
	id: string
	email: string
	name: string | null
	posto: string | null
	org: string | null
	forecast_meals: Array<{ date: string; meal: MealKey }>
	presence_meals: Array<{ date: string; meal: MealKey }>
	forecast_count: number
	presence_count: number
}

export interface DashboardFilters {
	startDate: string
	endDate: string
	mess_hall_id?: number
	unit_id?: number
}

export interface AggregatedPresenceRecord {
	date: string
	mess_hall_id: number
	mess_hall_name: string
	meal: MealKey
	forecast_count: number
	presence_count: number
	difference: number
	attendance_rate: number
	absences: PersonDetail[]
	attended: PersonDetail[]
	extras: PersonDetail[]
}
