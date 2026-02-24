import { useQuery } from "@tanstack/react-query"
import { fetchDailyMenuContentFn } from "@/server/daily-menu-content.fn"

export interface DishIngredient {
	product_name: string
	quantity: number
	measure_unit: string
}

export interface DishDetails {
	id: string
	name: string
	ingredients: DishIngredient[]
}

export interface DayMenuContent {
	[date: string]: {
		[mealKey: string]: DishDetails[] // mealKey: cafe, almoco, janta, ceia
	}
}

export const useDailyMenuContent = (kitchenIds: number[], startDate: string, endDate: string) => {
	return useQuery({
		queryKey: ["dailyMenuContent", kitchenIds, startDate, endDate],
		enabled: kitchenIds.length > 0 && !!startDate && !!endDate,
		staleTime: 5 * 60 * 1000, // 5 minutes
		queryFn: () => fetchDailyMenuContentFn({ data: { kitchenIds, startDate, endDate } }),
	})
}
