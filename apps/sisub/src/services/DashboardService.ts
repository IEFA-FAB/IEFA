// Dashboard Service - IEFA API Integration

import { queryOptions } from "@tanstack/react-query";
import type {
	DashboardPresenceRecord,
	ForecastRecord,
	MessHallAPI,
	UnitAPI,
	UserDataAPI,
	UserMilitaryDataAPI,
} from "@/types/domain/dashboard";

const IEFA_API_BASE = "https://iefa-api.fly.dev";

// ============================================================================
// QUERY KEYS
// ============================================================================

export const DASHBOARD_QUERY_KEYS = {
	forecasts: (params: {
		mess_hall_id?: number;
		startDate?: string;
		endDate?: string;
	}) => ["dashboard", "forecasts", params] as const,

	presences: (params: { mess_hall_id?: number }) =>
		["dashboard", "presences", params] as const,

	messHalls: (unit_id?: number) => ["mess-halls", unit_id] as const,

	units: () => ["units"] as const,

	userData: (ids?: string[]) => ["user-data", ids] as const,

	userMilitaryData: (nrOrdemList?: string[]) =>
		["user-military-data", nrOrdemList] as const,
} as const;

// ============================================================================
// FETCHERS
// ============================================================================

/**
 * Fetch forecasts from /api/rancho_previsoes
 */
export async function fetchForecasts(params: {
	mess_hall_id?: number;
	startDate?: string;
	endDate?: string;
}): Promise<ForecastRecord[]> {
	const url = new URL(`${IEFA_API_BASE}/api/rancho_previsoes`);

	if (params.mess_hall_id) {
		url.searchParams.set("mess_hall_id", params.mess_hall_id.toString());
	}

	const response = await fetch(url.toString());
	if (!response.ok) {
		throw new Error(
			`Failed to fetch forecasts: ${response.status} ${response.statusText}`,
		);
	}

	const data = await response.json();

	// Client-side filtering by date range (API doesn't support date filtering yet)
	if (params.startDate || params.endDate) {
		return data.filter((record: ForecastRecord) => {
			if (params.startDate && record.date < params.startDate) return false;
			if (params.endDate && record.date > params.endDate) return false;
			return true;
		});
	}

	return data;
}

/**
 * Fetch presences from /api/wherewhowhen
 */
export async function fetchPresences(params: {
	mess_hall_id?: number;
	startDate?: string;
	endDate?: string;
}): Promise<DashboardPresenceRecord[]> {
	const url = new URL(`${IEFA_API_BASE}/api/wherewhowhen`);

	if (params.mess_hall_id) {
		url.searchParams.set("mess_hall_id", params.mess_hall_id.toString());
	}

	const response = await fetch(url.toString());
	if (!response.ok) {
		throw new Error(
			`Failed to fetch presences: ${response.status} ${response.statusText}`,
		);
	}

	const data = await response.json();

	// Client-side filtering by date range
	if (params.startDate || params.endDate) {
		return data.filter((record: DashboardPresenceRecord) => {
			if (params.startDate && record.date < params.startDate) return false;
			if (params.endDate && record.date > params.endDate) return false;
			return true;
		});
	}

	return data;
}

/**
 * Fetch mess halls from /api/mess-halls
 */
export async function fetchMessHalls(unit_id?: number): Promise<MessHallAPI[]> {
	const url = new URL(`${IEFA_API_BASE}/api/mess-halls`);

	if (unit_id) {
		url.searchParams.set("unit_id", unit_id.toString());
	}

	const response = await fetch(url.toString());
	if (!response.ok) {
		throw new Error(
			`Failed to fetch mess halls: ${response.status} ${response.statusText}`,
		);
	}

	return response.json();
}

/**
 * Fetch units from /api/units
 */
export async function fetchUnits(): Promise<UnitAPI[]> {
	const response = await fetch(`${IEFA_API_BASE}/api/units`);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch units: ${response.status} ${response.statusText}`,
		);
	}

	return response.json();
}

/**
 * Fetch user data from /api/user-data
 */
export async function fetchUserData(ids?: string[]): Promise<UserDataAPI[]> {
	const url = new URL(`${IEFA_API_BASE}/api/user-data`);

	if (ids && ids.length > 0) {
		// API supports comma-separated IDs
		url.searchParams.set("id", ids.join(","));
	}

	const response = await fetch(url.toString());
	if (!response.ok) {
		throw new Error(
			`Failed to fetch user data: ${response.status} ${response.statusText}`,
		);
	}

	return response.json();
}

/**
 * Fetch user military data from /api/user-military-data
 */
export async function fetchUserMilitaryData(
	nrOrdemList?: string[],
): Promise<UserMilitaryDataAPI[]> {
	const url = new URL(`${IEFA_API_BASE}/api/user-military-data`);

	if (nrOrdemList && nrOrdemList.length > 0) {
		url.searchParams.set("nrOrdem", nrOrdemList.join(","));
	}

	const response = await fetch(url.toString());
	if (!response.ok) {
		throw new Error(
			`Failed to fetch military data: ${response.status} ${response.statusText}`,
		);
	}

	return response.json();
}

// ============================================================================
// QUERY OPTIONS
// ============================================================================

/**
 * Query options for forecasts
 */
export const dashboardForecastsQueryOptions = (params: {
	mess_hall_id?: number;
	startDate?: string;
	endDate?: string;
}) =>
	queryOptions({
		queryKey: DASHBOARD_QUERY_KEYS.forecasts(params),
		queryFn: () => fetchForecasts(params),
		staleTime: 1000 * 60 * 2, // 2 minutes
		gcTime: 1000 * 60 * 10, // 10 minutes
	});

/**
 * Query options for presences
 */
export const dashboardPresencesQueryOptions = (params: {
	mess_hall_id?: number;
	startDate?: string;
	endDate?: string;
}) =>
	queryOptions({
		queryKey: DASHBOARD_QUERY_KEYS.presences(params),
		queryFn: () => fetchPresences(params),
		staleTime: 1000 * 60 * 2, // 2 minutes
		gcTime: 1000 * 60 * 10,
	});

/**
 * Query options for mess halls
 */
export const messHallsQueryOptions = (unit_id?: number) =>
	queryOptions({
		queryKey: DASHBOARD_QUERY_KEYS.messHalls(unit_id),
		queryFn: () => fetchMessHalls(unit_id),
		staleTime: 1000 * 60 * 10, // 10 minutes (reference data)
		gcTime: 1000 * 60 * 30, // 30 minutes
	});

/**
 * Query options for units
 */
export const unitsQueryOptions = () =>
	queryOptions({
		queryKey: DASHBOARD_QUERY_KEYS.units(),
		queryFn: fetchUnits,
		staleTime: 1000 * 60 * 30, // 30 minutes (reference data)
		gcTime: 1000 * 60 * 60, // 1 hour
	});

/**
 * Query options for user data
 */
export const userDataQueryOptions = (ids?: string[]) =>
	queryOptions({
		queryKey: DASHBOARD_QUERY_KEYS.userData(ids),
		queryFn: () => fetchUserData(ids),
		staleTime: 1000 * 60 * 5, // 5 minutes
		gcTime: 1000 * 60 * 15,
		enabled: !!ids && ids.length > 0,
	});

/**
 * Query options for user military data
 */
export const userMilitaryDataQueryOptions = (nrOrdemList?: string[]) =>
	queryOptions({
		queryKey: DASHBOARD_QUERY_KEYS.userMilitaryData(nrOrdemList),
		queryFn: () => fetchUserMilitaryData(nrOrdemList),
		staleTime: 1000 * 60 * 5, // 5 minutes
		gcTime: 1000 * 60 * 15,
		enabled: !!nrOrdemList && nrOrdemList.length > 0,
	});
