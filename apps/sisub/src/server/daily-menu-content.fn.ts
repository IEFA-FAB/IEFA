import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"

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
		[mealKey: string]: DishDetails[]
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

export const fetchDailyMenuContentFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			kitchenIds: z.array(z.number()),
			startDate: z.string(),
			endDate: z.string(),
		})
	)
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("daily_menu")
			.select(
				`
        service_date,
        kitchen_id,
        meal_type:meal_type_id(name),
        menu_items:menu_items(
          id,
          recipe,
          recipe_origin:recipe_origin_id(name)
        )
      `
			)
			.in("kitchen_id", data.kitchenIds)
			.gte("service_date", data.startDate)
			.lte("service_date", data.endDate)

		if (error) throw new Error(error.message)

		const content: DayMenuContent = {}

		result?.forEach((menu) => {
			const date = menu.service_date
			if (!date) return

			const mealName = menu.meal_type?.name
			if (!mealName) return

			const mealKey = mapMealTypeNameToKey(mealName)
			if (!mealKey) return

			if (!content[date]) content[date] = {}
			if (!content[date][mealKey]) content[date][mealKey] = []

			menu.menu_items.forEach((item) => {
				let dishName = "Prato sem nome"
				let ingredients: DishIngredient[] = []

				if (item.recipe) {
					const snapshot = item.recipe as unknown as RecipeSnapshot
					dishName = snapshot?.name || dishName
					if (snapshot.ingredients) {
						ingredients = snapshot.ingredients
					}
				} else if (item.recipe_origin) {
					dishName = item.recipe_origin.name || dishName
				}

				const dish: DishDetails = { id: item.id, name: dishName, ingredients }
				content[date][mealKey].push(dish)
			})
		})

		return content
	})
