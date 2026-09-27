import { queryOptions } from "@tanstack/react-query"
import { fetchMessHallByCodeFn, fetchUserArranchamentoFn } from "@/server/messhall.fn"
import type { MealKey } from "@/types/domain/meal"

export const QUERY_KEYS = {
	messHall: (code: string) => ["messHall", code] as const,
	arranchamento: (userId: string, date: string, meal: MealKey, messHallId: number) => ["arranchamento", userId, date, meal, messHallId] as const,
} as const

export const messHallByCodeQueryOptions = (code: string) =>
	queryOptions({
		queryKey: QUERY_KEYS.messHall(code),
		queryFn: () => fetchMessHallByCodeFn({ data: { code } }),
		staleTime: 60 * 60 * 1000, // 1 hour (mess halls change rarely)
	})

export const userArranchamentoQueryOptions = (userId: string, date: string, meal: MealKey, messHallId: number | null) =>
	queryOptions({
		queryKey: messHallId ? QUERY_KEYS.arranchamento(userId, date, meal, messHallId) : (["arranchamento", userId, date, meal, null] as const),
		queryFn: messHallId ? () => fetchUserArranchamentoFn({ data: { userId, date, meal, messHallId } }) : () => null,
		enabled: !!messHallId,
	})
