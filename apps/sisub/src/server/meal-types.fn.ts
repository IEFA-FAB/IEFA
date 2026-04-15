/**
 * @module meal-types.fn
 * Meal type (refeição) CRUD with soft-delete and scope-based filtering.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLE: meal_type (soft-delete via deleted_at).
 * Scope: kitchenId=null → global types only; non-null → global OR matching kitchen (PostgREST OR filter).
 */

import type { MealType, MealTypeInsert, MealTypeUpdate } from "@iefa/database/sisub"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"

const MealTypeWriteSchema = z.object({
	name: z.string().nullable().optional(),
	sort_order: z.number().nullable().optional(),
	kitchen_id: z.number().nullable().optional(),
})

/**
 * Lists active meal types for a kitchen scope ordered by sort_order.
 *
 * @remarks
 * kitchenId=null → global only; non-null → global OR matching kitchen (PostgREST OR filter).
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchMealTypesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number().nullable() }))
	.handler(async ({ data }) => {
		let query = getSupabaseServerClient().from("meal_type").select("*").is("deleted_at", null).order("sort_order")

		if (data.kitchenId !== null) {
			query = query.or(`kitchen_id.is.null,kitchen_id.eq.${data.kitchenId}`)
		} else {
			query = query.is("kitchen_id", null)
		}

		const { data: result, error } = await query

		if (error) throw new Error(`Failed to fetch meal types: ${error.message}`)

		return (result ?? []) as MealType[]
	})

/**
 * Creates a meal type. kitchen_id=null creates a global type; non-null creates a kitchen-local type.
 *
 * @remarks
 * SIDE EFFECTS: inserts into meal_type.
 *
 * @throws {Error} on Supabase insert failure.
 */
export const createMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(MealTypeWriteSchema)
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("meal_type")
			.insert(data as MealTypeInsert)
			.select()
			.single()

		if (error) throw new Error(`Failed to create meal type: ${error.message}`)

		return result as MealType
	})

/**
 * Updates a meal type's name, sort_order or kitchen_id.
 *
 * @throws {Error} on Supabase update failure.
 */
export const updateMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string(), updates: MealTypeWriteSchema }))
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

/**
 * Soft-deletes a meal type by setting deleted_at.
 *
 * @throws {Error} on Supabase update failure.
 */
export const deleteMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("meal_type").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)

		if (error) throw new Error(`Failed to delete meal type: ${error.message}`)
	})

/**
 * Restores a soft-deleted meal type by clearing deleted_at.
 *
 * @throws {Error} on Supabase update failure.
 */
export const restoreMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("meal_type").update({ deleted_at: null }).eq("id", data.id)

		if (error) throw new Error(`Failed to restore meal type: ${error.message}`)
	})
