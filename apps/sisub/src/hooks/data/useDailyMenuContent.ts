import { useQuery } from "@tanstack/react-query"
import { fetchDailyMenuContentFn } from "@/server/daily-menu-content.fn"

export type { DayMenuContent, DishDetails, DishIngredient } from "@/server/daily-menu-content.fn"

export const useDailyMenuContent = (kitchenIds: number[], startDate: string, endDate: string) => {
	return useQuery({
		queryKey: ["dailyMenuContent", kitchenIds, startDate, endDate],
		enabled: kitchenIds.length > 0 && !!startDate && !!endDate,
		staleTime: 5 * 60 * 1000, // 5 minutes
		queryFn: () => fetchDailyMenuContentFn({ data: { kitchenIds, startDate, endDate } }),
	})
}
