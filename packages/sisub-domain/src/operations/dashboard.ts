/**
 * Dashboard HTTP operations — fetch data from the IEFA external API.
 * baseUrl is injectable so callers can configure the endpoint (e.g. env var).
 */

import type { DashboardPresenceRecord, ForecastRecord, MessHallAPI, UnitAPI, UserDataAPI, UserMilitaryDataAPI } from "../types/dashboard.ts"

async function get<T>(url: URL): Promise<T> {
	const response = await fetch(url.toString())
	if (!response.ok) throw new Error(`[${response.status}] ${url.pathname}: ${response.statusText}`)
	return response.json() as Promise<T>
}

export async function fetchForecasts(baseUrl: string, params: { mess_hall_id?: number; startDate?: string; endDate?: string }): Promise<ForecastRecord[]> {
	const url = new URL("/api/rancho_previsoes", baseUrl)
	if (params.mess_hall_id) url.searchParams.set("mess_hall_id", params.mess_hall_id.toString())

	const data = await get<ForecastRecord[]>(url)

	if (params.startDate || params.endDate) {
		return data.filter((r) => {
			if (params.startDate && r.date < params.startDate) return false
			if (params.endDate && r.date > params.endDate) return false
			return true
		})
	}
	return data
}

export async function fetchPresences(
	baseUrl: string,
	params: { mess_hall_id?: number; startDate?: string; endDate?: string }
): Promise<DashboardPresenceRecord[]> {
	const url = new URL("/api/wherewhowhen", baseUrl)
	if (params.mess_hall_id) url.searchParams.set("mess_hall_id", params.mess_hall_id.toString())

	const data = await get<DashboardPresenceRecord[]>(url)

	if (params.startDate || params.endDate) {
		return data.filter((r) => {
			if (params.startDate && r.date < params.startDate) return false
			if (params.endDate && r.date > params.endDate) return false
			return true
		})
	}
	return data
}

export async function fetchMessHalls(baseUrl: string, unit_id?: number): Promise<MessHallAPI[]> {
	const url = new URL("/api/mess-halls", baseUrl)
	if (unit_id) url.searchParams.set("unit_id", unit_id.toString())
	return get<MessHallAPI[]>(url)
}

export async function fetchUnits(baseUrl: string): Promise<UnitAPI[]> {
	return get<UnitAPI[]>(new URL("/api/units", baseUrl))
}

export async function fetchUserData(baseUrl: string, ids?: string[]): Promise<UserDataAPI[]> {
	const url = new URL("/api/user-data", baseUrl)
	if (ids && ids.length > 0) url.searchParams.set("id", ids.join(","))
	return get<UserDataAPI[]>(url)
}

export async function fetchUserMilitaryData(baseUrl: string, nrOrdemList?: string[]): Promise<UserMilitaryDataAPI[]> {
	const url = new URL("/api/user-military-data", baseUrl)
	if (nrOrdemList && nrOrdemList.length > 0) url.searchParams.set("nrOrdem", nrOrdemList.join(","))
	return get<UserMilitaryDataAPI[]>(url)
}
