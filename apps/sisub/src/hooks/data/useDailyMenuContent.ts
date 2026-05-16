import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchDailyMenuContentFn } from "@/server/daily-menu-content.fn"

export type { DayMenuContent, DishDetails, DishIngredient } from "@/server/daily-menu-content.fn"

export const useDailyMenuContent = (kitchenIds: number[], startDate: string, endDate: string) => {
	return useQuery({
		queryKey: queryKeys.dailyMenus.content(kitchenIds, startDate, endDate),
		enabled: kitchenIds.length > 0 && !!startDate && !!endDate,
		staleTime: 5 * 60 * 1000, // 5 minutes
		queryFn: () => fetchDailyMenuContentFn({ data: { kitchenIds, startDate, endDate } }),
	})
}
