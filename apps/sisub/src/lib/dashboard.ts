// Dashboard Helper Functions

import type {
	AggregatedPresenceRecord,
	ArranchamentoRecord,
	DailyMealStat,
	DashboardMetrics,
	DashboardPresenceRecord,
	MealKey,
	MealTypeStat,
	MessHallAPI,
	MessHallStats,
	PersonDetail,
	UserDataAPI,
	UserMealDetail,
	UserMilitaryDataAPI,
} from "@iefa/sisub-domain/types"

const MEAL_KEYS: MealKey[] = ["cafe", "almoco", "janta", "ceia"]

/**
 * Aggregates dashboard metrics from arranchamentos and presences
 */
export function aggregateDashboardMetrics(
	arranchamentos: ArranchamentoRecord[],
	presences: DashboardPresenceRecord[],
	messHalls: MessHallAPI[],
	dateRange: { start: string; end: string }
): DashboardMetrics {
	// Filter by date range and will_eat = true
	const filteredArranchamentos = arranchamentos.filter((f) => f.date >= dateRange.start && f.date <= dateRange.end && f.will_eat)
	const filteredPresences = presences.filter((p) => p.date >= dateRange.start && p.date <= dateRange.end)

	// Calculate by meal type
	const by_meal_type: MealTypeStat[] = MEAL_KEYS.map((meal) => {
		const count = filteredArranchamentos.filter((f) => f.meal === meal).length
		const presence = filteredPresences.filter((p) => p.meal === meal).length
		const percentage = filteredArranchamentos.length > 0 ? (count / filteredArranchamentos.length) * 100 : 0

		return { meal, arranchamentos: count, presence, percentage }
	})

	// Calculate daily distribution
	const dateMap = new Map<string, DailyMealStat>()
	for (const arranchamento of filteredArranchamentos) {
		if (!dateMap.has(arranchamento.date)) {
			dateMap.set(arranchamento.date, {
				date: arranchamento.date,
				cafe: 0,
				almoco: 0,
				janta: 0,
				ceia: 0,
			})
		}
		const stat = dateMap.get(arranchamento.date)
		if (stat) stat[arranchamento.meal]++
	}
	const daily_distribution = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))

	// Calculate by mess hall
	const by_mess_hall: MessHallStats[] = messHalls.map((mh) => {
		const mhArranchamentos = filteredArranchamentos.filter((f) => f.mess_hall_id === mh.id)
		const mhPresences = filteredPresences.filter((p) => p.mess_hall_id === mh.id)

		const by_meal: MealTypeStat[] = MEAL_KEYS.map((meal) => {
			const count = mhArranchamentos.filter((f) => f.meal === meal).length
			const presence = mhPresences.filter((p) => p.meal === meal).length
			const percentage = mhArranchamentos.length > 0 ? (count / mhArranchamentos.length) * 100 : 0

			return { meal, arranchamentos: count, presence, percentage }
		})

		return {
			mess_hall_id: mh.id,
			mess_hall_name: mh.display_name,
			total_arranchamentos: mhArranchamentos.length,
			total_presence: mhPresences.length,
			by_meal,
		}
	})

	return {
		total_arranchamentos: filteredArranchamentos.length,
		total_presence: filteredPresences.length,
		by_meal_type,
		daily_distribution,
		by_mess_hall,
	}
}

/**
 * Builds user meal details for the presence table
 */
export function buildUserMealDetails(
	arranchamentos: ArranchamentoRecord[],
	presences: DashboardPresenceRecord[],
	userData: UserDataAPI[],
	militaryData: UserMilitaryDataAPI[]
): UserMealDetail[] {
	return userData.map((user) => {
		const military = militaryData.find((m) => m.nrOrdem === user.nrOrdem)
		const userArranchamentos = arranchamentos.filter((f) => f.user_id === user.id && f.will_eat)
		const userPresences = presences.filter((p) => p.user_id === user.id)

		return {
			id: user.id,
			email: user.email,
			name: military?.nmGuerra || military?.nmPessoa || null,
			posto: military?.sgPosto || null,
			org: military?.sgOrg || null,
			arranchamento_meals: userArranchamentos.map((f) => ({
				date: f.date,
				meal: f.meal,
			})),
			presence_meals: userPresences.map((p) => ({
				date: p.date,
				meal: p.meal,
			})),
			arranchamento_count: userArranchamentos.length,
			presence_count: userPresences.length,
		}
	})
}

/**
 * Formats date range for display
 */
/**
 * Parses a YYYY-MM-DD string into a local Date object (midnight)
 * Avoids UTC conversion issues with new Date("YYYY-MM-DD")
 */
export function parseLocalDate(dateString: string): Date {
	const [year, month, day] = dateString.split("-").map(Number)
	return new Date(year, month - 1, day)
}

/**
 * Formats date range for display
 */
export function formatDateRange(start: string, end: string): string {
	const startDate = parseLocalDate(start)
	const endDate = parseLocalDate(end)

	const options: Intl.DateTimeFormatOptions = {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	}

	return `${startDate.toLocaleDateString("pt-BR", options)} a ${endDate.toLocaleDateString("pt-BR", options)}`
}

/**
 * Calculates percentage safely
 */
export function calculatePercentage(part: number, total: number): number {
	return total > 0 ? (part / total) * 100 : 0
}

/**
 * Aggregates presence data by day/meal/mess_hall with drill-down lists
 */
export function aggregatePresenceData(
	arranchamentos: ArranchamentoRecord[],
	presences: DashboardPresenceRecord[],
	userData: UserDataAPI[],
	militaryData: UserMilitaryDataAPI[],
	messHalls: MessHallAPI[]
): AggregatedPresenceRecord[] {
	// Create a map for quick lookups
	const userMap = new Map(userData.map((u) => [u.id, u]))
	const militaryMap = new Map(militaryData.map((m) => [m.nrOrdem, m]))
	const messHallMap = new Map(messHalls.map((mh) => [mh.id, mh]))

	// Group by date + meal + mess_hall
	const groupKey = (date: string, meal: string, messHallId: number) => `${date}|${meal}|${messHallId}`

	const groups = new Map<
		string,
		{
			date: string
			meal: string
			mess_hall_id: number
			arranchados_users: Set<string>
			presence_users: Set<string>
		}
	>()

	// Process arranchamentos
	for (const f of arranchamentos.filter((f) => f.will_eat)) {
		const key = groupKey(f.date, f.meal, f.mess_hall_id)
		if (!groups.has(key)) {
			groups.set(key, {
				date: f.date,
				meal: f.meal,
				mess_hall_id: f.mess_hall_id,
				arranchados_users: new Set(),
				presence_users: new Set(),
			})
		}
		groups.get(key)?.arranchados_users.add(f.user_id)
	}

	// Process presences
	for (const p of presences) {
		const key = groupKey(p.date, p.meal, p.mess_hall_id)
		if (!groups.has(key)) {
			groups.set(key, {
				date: p.date,
				meal: p.meal,
				mess_hall_id: p.mess_hall_id,
				arranchados_users: new Set(),
				presence_users: new Set(),
			})
		}
		groups.get(key)?.presence_users.add(p.user_id)
	}

	// Build aggregated records
	const records: AggregatedPresenceRecord[] = []

	for (const [, group] of groups) {
		const messHall = messHallMap.get(group.mess_hall_id)
		if (!messHall) continue

		const arranchados_count = group.arranchados_users.size
		const presence_count = group.presence_users.size
		const difference = presence_count - arranchados_count
		const attendance_rate = calculatePercentage(presence_count, arranchados_count)

		// Build drill-down lists
		const getPersonDetail = (userId: string): PersonDetail => {
			const user = userMap.get(userId)
			const military = user?.nrOrdem ? militaryMap.get(user.nrOrdem) : undefined
			return {
				id: userId,
				email: user?.email || "Desconhecido",
				name: military?.nmGuerra || military?.nmPessoa || null,
				posto: military?.sgPosto || null,
				org: military?.sgOrg || null,
			}
		}

		// Absences: previram mas NÃO vieram
		const absences = Array.from(group.arranchados_users)
			.filter((uid) => !group.presence_users.has(uid))
			.map(getPersonDetail)

		// Attended: previram E vieram
		const attended = Array.from(group.arranchados_users)
			.filter((uid) => group.presence_users.has(uid))
			.map(getPersonDetail)

		// Extras: NÃO previram mas vieram
		const extras = Array.from(group.presence_users)
			.filter((uid) => !group.arranchados_users.has(uid))
			.map(getPersonDetail)

		records.push({
			date: group.date,
			mess_hall_id: group.mess_hall_id,
			mess_hall_name: messHall.display_name,
			meal: group.meal as import("@/types/domain/meal").MealKey,
			arranchados_count,
			presence_count,
			difference,
			attendance_rate,
			absences,
			attended,
			extras,
		})
	}

	// Sort by date DESC, then by meal
	return records.sort((a, b) => {
		if (a.date !== b.date) return b.date.localeCompare(a.date)
		const mealOrder = { cafe: 0, almoco: 1, janta: 2, ceia: 3 }
		return mealOrder[a.meal] - mealOrder[b.meal]
	})
}
