import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { MealType, MealTypeInsert, MealTypeUpdate } from "@/types/supabase.types"

export const fetchMealTypesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number().nullable() }))
	.handler(async ({ data }) => {
		let query = getSupabaseServerClient()
			.from("meal_type")
			.select("*")
			.is("deleted_at", null)
			.order("sort_order")

		if (data.kitchenId !== null) {
			query = query.or(`kitchen_id.is.null,kitchen_id.eq.${data.kitchenId}`)
		} else {
			query = query.is("kitchen_id", null)
		}

		const { data: result, error } = await query

		if (error) throw new Error(`Failed to fetch meal types: ${error.message}`)

		return (result ?? []) as MealType[]
	})

export const createMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(z.record(z.unknown()))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("meal_type")
			.insert(data as MealTypeInsert)
			.select()
			.single()

		if (error) throw new Error(`Failed to create meal type: ${error.message}`)

		return result as MealType
	})

export const updateMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string(), updates: z.record(z.unknown()) }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("meal_type")
			.update(data.updates as MealTypeUpdate)
			.eq("id", data.id)
			.select()
			.single()

		if (error) throw new Error(`Failed to update meal type: ${error.message}`)

		return result as MealType
	})

export const deleteMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.from("meal_type")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", data.id)

		if (error) throw new Error(`Failed to delete meal type: ${error.message}`)
	})

export const restoreMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.from("meal_type")
			.update({ deleted_at: null })
			.eq("id", data.id)

		if (error) throw new Error(`Failed to restore meal type: ${error.message}`)
	})
