/**
 * @module daily-menu-content.fn
 * Aggregates daily menu content (dishes + ingredients) across multiple kitchens for a date range.
 * Thin wrapper over @iefa/sisub-domain (operations/planning.fetchDailyMenuContent).
 * Output shape: DayMenuContent = { [date: string]: { [mealKey: string]: DishDetails[] } }.
 * @domain core
 * @migration done
 */

import { FetchDailyMenuContentSchema, fetchDailyMenuContent } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export interface DishIngredient {
	ingredient_name: string
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

export const fetchDailyMenuContentFn = createServerFn({ method: "GET" })
	.inputValidator(FetchDailyMenuContentSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return (await fetchDailyMenuContent(getDb(), ctx, data).catch(handleDomainError)) as unknown as DayMenuContent
	})
