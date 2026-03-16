import { queryOptions } from "@tanstack/react-query"
import { fetchMessHallByCodeFn, fetchUserMealForecastFn } from "@/server/messhall.fn"
import type { MealKey } from "@/types/domain/meal"

export const QUERY_KEYS = {
	messHall: (code: string) => ["messHall", code] as const,
	mealForecast: (userId: string, date: string, meal: MealKey, messHallId: number) => ["mealForecast", userId, date, meal, messHallId] as const,
} as const

export const messHallByCodeQueryOptions = (code: string) =>
	queryOptions({
		queryKey: QUERY_KEYS.messHall(code),
		queryFn: () => fetchMessHallByCodeFn({ data: { code } }),
		staleTime: 60 * 60 * 1000, // 1 hour (mess halls change rarely)
	})

export const userMealForecastQueryOptions = (userId: string, date: string, meal: MealKey, messHallId: number | null) =>
	queryOptions({
		queryKey: messHallId ? QUERY_KEYS.mealForecast(userId, date, meal, messHallId) : (["mealForecast", userId, date, meal, null] as const),
		queryFn: messHallId ? () => fetchUserMealForecastFn({ data: { userId, date, meal, messHallId } }) : () => null,
		enabled: !!messHallId,
	})
