// Dashboard Service - IEFA API Integration

import { fetchForecasts, fetchMessHalls, fetchPresences, fetchUnits, fetchUserData, fetchUserMilitaryData } from "@iefa/sisub-domain"
import { queryOptions } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"

const IEFA_API_BASE = "https://api.iefa.com.br"

// ============================================================================
// QUERY OPTIONS
// ============================================================================

export const dashboardForecastsQueryOptions = (params: { mess_hall_id?: number; startDate?: string; endDate?: string }) =>
	queryOptions({
		queryKey: queryKeys.dashboard.forecasts(params),
		queryFn: () => fetchForecasts(IEFA_API_BASE, params),
		staleTime: 1000 * 60 * 2,
		gcTime: 1000 * 60 * 10,
	})

export const dashboardPresencesQueryOptions = (params: { mess_hall_id?: number; startDate?: string; endDate?: string }) =>
	queryOptions({
		queryKey: queryKeys.dashboard.presences(params),
		queryFn: () => fetchPresences(IEFA_API_BASE, params),
		staleTime: 1000 * 60 * 1,
		gcTime: 1000 * 60 * 10,
	})

export const messHallsQueryOptions = (unit_id?: number) =>
	queryOptions({
		queryKey: queryKeys.dashboard.messHalls(unit_id),
		queryFn: () => fetchMessHalls(IEFA_API_BASE, unit_id),
		staleTime: 1000 * 60 * 10,
		gcTime: 1000 * 60 * 30,
	})

export const unitsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.dashboard.units(),
		queryFn: () => fetchUnits(IEFA_API_BASE),
		staleTime: 1000 * 60 * 30,
		gcTime: 1000 * 60 * 60,
	})

export const userDataQueryOptions = (ids?: string[]) =>
	queryOptions({
		queryKey: queryKeys.dashboard.userData(ids),
		queryFn: () => fetchUserData(IEFA_API_BASE, ids),
		staleTime: 1000 * 60 * 5,
		gcTime: 1000 * 60 * 15,
		enabled: !!ids && ids.length > 0,
	})

export const userMilitaryDataQueryOptions = (nrOrdemList?: string[]) =>
	queryOptions({
		queryKey: queryKeys.dashboard.userMilitaryData(nrOrdemList),
		queryFn: () => fetchUserMilitaryData(IEFA_API_BASE, nrOrdemList),
		staleTime: 1000 * 60 * 5,
		gcTime: 1000 * 60 * 15,
		enabled: !!nrOrdemList && nrOrdemList.length > 0,
	})
