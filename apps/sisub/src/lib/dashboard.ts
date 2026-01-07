// Dashboard Helper Functions

import type {
	DailyMealStat,
	DashboardMetrics,
	ForecastRecord,
	MealTypeStat,
	MessHallAPI,
	MessHallStats,
	PresenceRecord,
	UserDataAPI,
	UserMealDetail,
	UserMilitaryDataAPI,
} from "@/types/domain/dashboard";
import type { MealKey } from "@/types/domain/meal";

const MEAL_KEYS: MealKey[] = ["cafe", "almoco", "janta", "ceia"];

/**
 * Aggregates dashboard metrics from forecasts and presences
 */
export function aggregateDashboardMetrics(
	forecasts: ForecastRecord[],
	presences: PresenceRecord[],
	messHalls: MessHallAPI[],
	dateRange: { start: string; end: string },
): DashboardMetrics {
	// Filter by date range and will_eat = true
	const filteredForecasts = forecasts.filter(
		(f) => f.date >= dateRange.start && f.date <= dateRange.end && f.will_eat,
	);
	const filteredPresences = presences.filter(
		(p) => p.date >= dateRange.start && p.date <= dateRange.end,
	);

	// Calculate by meal type
	const by_meal_type: MealTypeStat[] = MEAL_KEYS.map((meal) => {
		const forecast = filteredForecasts.filter((f) => f.meal === meal).length;
		const presence = filteredPresences.filter((p) => p.meal === meal).length;
		const percentage =
			filteredForecasts.length > 0
				? (forecast / filteredForecasts.length) * 100
				: 0;

		return { meal, forecast, presence, percentage };
	});

	// Calculate daily distribution
	const dateMap = new Map<string, DailyMealStat>();
	for (const forecast of filteredForecasts) {
		if (!dateMap.has(forecast.date)) {
			dateMap.set(forecast.date, {
				date: forecast.date,
				cafe: 0,
				almoco: 0,
				janta: 0,
				ceia: 0,
			});
		}
		const stat = dateMap.get(forecast.date)!;
		stat[forecast.meal]++;
	}
	const daily_distribution = Array.from(dateMap.values()).sort((a, b) =>
		a.date.localeCompare(b.date),
	);

	// Calculate by mess hall
	const by_mess_hall: MessHallStats[] = messHalls.map((mh) => {
		const mhForecasts = filteredForecasts.filter(
			(f) => f.mess_hall_id === mh.id,
		);
		const mhPresences = filteredPresences.filter(
			(p) => p.mess_hall_id === mh.id,
		);

		const by_meal: MealTypeStat[] = MEAL_KEYS.map((meal) => {
			const forecast = mhForecasts.filter((f) => f.meal === meal).length;
			const presence = mhPresences.filter((p) => p.meal === meal).length;
			const percentage =
				mhForecasts.length > 0 ? (forecast / mhForecasts.length) * 100 : 0;

			return { meal, forecast, presence, percentage };
		});

		return {
			mess_hall_id: mh.id,
			mess_hall_name: mh.display_name,
			total_forecast: mhForecasts.length,
			total_presence: mhPresences.length,
			by_meal,
		};
	});

	return {
		total_forecast: filteredForecasts.length,
		total_presence: filteredPresences.length,
		by_meal_type,
		daily_distribution,
		by_mess_hall,
	};
}

/**
 * Builds user meal details for the presence table
 */
export function buildUserMealDetails(
	forecasts: ForecastRecord[],
	presences: PresenceRecord[],
	userData: UserDataAPI[],
	militaryData: UserMilitaryDataAPI[],
): UserMealDetail[] {
	return userData.map((user) => {
		const military = militaryData.find((m) => m.nrOrdem === user.nrOrdem);
		const userForecasts = forecasts.filter(
			(f) => f.user_id === user.id && f.will_eat,
		);
		const userPresences = presences.filter((p) => p.user_id === user.id);

		return {
			id: user.id,
			email: user.email,
			name: military?.nmGuerra || military?.nmPessoa || null,
			posto: military?.sgPosto || null,
			org: military?.sgOrg || null,
			forecast_meals: userForecasts.map((f) => ({
				date: f.date,
				meal: f.meal,
			})),
			presence_meals: userPresences.map((p) => ({
				date: p.date,
				meal: p.meal,
			})),
			forecast_count: userForecasts.length,
			presence_count: userPresences.length,
		};
	});
}

/**
 * Formats date range for display
 */
export function formatDateRange(start: string, end: string): string {
	const startDate = new Date(start);
	const endDate = new Date(end);

	const options: Intl.DateTimeFormatOptions = {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	};

	return `${startDate.toLocaleDateString("pt-BR", options)} a ${endDate.toLocaleDateString("pt-BR", options)}`;
}

/**
 * Calculates percentage safely
 */
export function calculatePercentage(part: number, total: number): number {
	return total > 0 ? (part / total) * 100 : 0;
}

/**
 * Aggregates presence data by day/meal/mess_hall with drill-down lists
 */
export function aggregatePresenceData(
	forecasts: import("@/types/domain/dashboard").ForecastRecord[],
	presences: import("@/types/domain/dashboard").PresenceRecord[],
	userData: import("@/types/domain/dashboard").UserDataAPI[],
	militaryData: import("@/types/domain/dashboard").UserMilitaryDataAPI[],
	messHalls: import("@/types/domain/dashboard").MessHallAPI[],
): import("@/types/domain/dashboard").AggregatedPresenceRecord[] {
	// Create a map for quick lookups
	const userMap = new Map(userData.map((u) => [u.id, u]));
	const militaryMap = new Map(militaryData.map((m) => [m.nrOrdem, m]));
	const messHallMap = new Map(messHalls.map((mh) => [mh.id, mh]));

	// Group by date + meal + mess_hall
	const groupKey = (date: string, meal: string, messHallId: number) =>
		`${date}|${meal}|${messHallId}`;

	const groups = new Map<
		string,
		{
			date: string;
			meal: string;
			mess_hall_id: number;
			forecast_users: Set<string>;
			presence_users: Set<string>;
		}
	>();

	// Process forecasts
	for (const f of forecasts.filter((f) => f.will_eat)) {
		const key = groupKey(f.date, f.meal, f.mess_hall_id);
		if (!groups.has(key)) {
			groups.set(key, {
				date: f.date,
				meal: f.meal,
				mess_hall_id: f.mess_hall_id,
				forecast_users: new Set(),
				presence_users: new Set(),
			});
		}
		groups.get(key)!.forecast_users.add(f.user_id);
	}

	// Process presences
	for (const p of presences) {
		const key = groupKey(p.date, p.meal, p.mess_hall_id);
		if (!groups.has(key)) {
			groups.set(key, {
				date: p.date,
				meal: p.meal,
				mess_hall_id: p.mess_hall_id,
				forecast_users: new Set(),
				presence_users: new Set(),
			});
		}
		groups.get(key)!.presence_users.add(p.user_id);
	}

	// Build aggregated records
	const records: import("@/types/domain/dashboard").AggregatedPresenceRecord[] =
		[];

	for (const [, group] of groups) {
		const messHall = messHallMap.get(group.mess_hall_id);
		if (!messHall) continue;

		const forecast_count = group.forecast_users.size;
		const presence_count = group.presence_users.size;
		const difference = presence_count - forecast_count;
		const attendance_rate = calculatePercentage(presence_count, forecast_count);

		// Build drill-down lists
		const getPersonDetail = (
			userId: string,
		): import("@/types/domain/dashboard").PersonDetail => {
			const user = userMap.get(userId);
			const military = user?.nrOrdem
				? militaryMap.get(user.nrOrdem)
				: undefined;
			return {
				id: userId,
				email: user?.email || "Desconhecido",
				name: military?.nmGuerra || military?.nmPessoa || null,
				posto: military?.sgPosto || null,
				org: military?.sgOrg || null,
			};
		};

		// Absences: previram mas NÃO vieram
		const absences = Array.from(group.forecast_users)
			.filter((uid) => !group.presence_users.has(uid))
			.map(getPersonDetail);

		// Attended: previram E vieram
		const attended = Array.from(group.forecast_users)
			.filter((uid) => group.presence_users.has(uid))
			.map(getPersonDetail);

		// Extras: NÃO previram mas vieram
		const extras = Array.from(group.presence_users)
			.filter((uid) => !group.forecast_users.has(uid))
			.map(getPersonDetail);

		records.push({
			date: group.date,
			mess_hall_id: group.mess_hall_id,
			mess_hall_name: messHall.display_name,
			meal: group.meal as import("@/types/domain/meal").MealKey,
			forecast_count,
			presence_count,
			difference,
			attendance_rate,
			absences,
			attended,
			extras,
		});
	}

	// Sort by date DESC, then by meal
	return records.sort((a, b) => {
		if (a.date !== b.date) return b.date.localeCompare(a.date);
		const mealOrder = { cafe: 0, almoco: 1, janta: 2, ceia: 3 };
		return mealOrder[a.meal] - mealOrder[b.meal];
	});
}
