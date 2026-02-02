import { useQuery } from "@tanstack/react-query"
import supabase from "@/lib/supabase"

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

interface RecipeSnapshot {
	name: string
	ingredients?: Array<{
		product_name: string
		quantity: number
		measure_unit: string
	}>
}

const mapMealTypeNameToKey = (name: string): string | null => {
	const lower = name.toLowerCase()
	if (lower.includes("café")) return "cafe"
	if (lower.includes("almoço")) return "almoco"
	if (lower.includes("jantar")) return "janta"
	if (lower.includes("ceia")) return "ceia"
	return null
}

export const useDailyMenuContent = (kitchenIds: number[], startDate: string, endDate: string) => {
	return useQuery({
		queryKey: ["dailyMenuContent", kitchenIds, startDate, endDate],
		enabled: kitchenIds.length > 0 && !!startDate && !!endDate,
		staleTime: 5 * 60 * 1000, // 5 minutes
		queryFn: async () => {
			const { data, error } = await supabase
				.schema("sisub")
				.from("daily_menu")
				.select(`
                    service_date,
                    kitchen_id,
                    meal_type:meal_type_id(name),
                    menu_items:menu_items(
                        id,
                        recipe,
                        recipe_origin:recipe_origin_id(name)
                    )
                `)
				.in("kitchen_id", kitchenIds)
				.gte("service_date", startDate)
				.lte("service_date", endDate)

			if (error) throw error

			const content: DayMenuContent = {}

			data?.forEach((menu) => {
				const date = menu.service_date
				if (!date) return

				// @ts-expect-error
				const mealName = menu.meal_type?.name
				if (!mealName) return

				const mealKey = mapMealTypeNameToKey(mealName)
				if (!mealKey) return

				if (!content[date]) {
					content[date] = {}
				}
				if (!content[date][mealKey]) {
					content[date][mealKey] = []
				}

				menu.menu_items.forEach((item: any) => {
					let dishName = "Prato sem nome"
					let ingredients: DishIngredient[] = []

					// Try to use snapshot first
					if (item.recipe) {
						const snapshot = item.recipe as RecipeSnapshot
						dishName = snapshot.name || dishName
						if (snapshot.ingredients) {
							ingredients = snapshot.ingredients
						}
					} else if (item.recipe_origin) {
						// Fallback to origin name
						dishName = item.recipe_origin.name || dishName
					}

					content[date][mealKey].push({
						id: item.id,
						name: dishName,
						ingredients,
					})
				})
			})

			return content
		},
	})
}
