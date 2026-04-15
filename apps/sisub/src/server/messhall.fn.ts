/**
 * @module messhall.fn
 * Mess hall lookup, diner forecast queries and extra-presence (other_presences) tracking.
 * CLIENT: getSupabaseServerClient (service role). Schema: sisub (explicit .schema("sisub")) on all functions.
 * TABLES/VIEWS: mess_halls, meal_forecasts, other_presences, v_user_identity (view).
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { MealKey } from "@/types/domain/meal"

/**
 * Fetches a mess hall by its unique code string. Returns null if not found.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchMessHallByCodeFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ code: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("mess_halls")
			.select("id, unit_id, code, display_name")
			.eq("code", data.code)
			.maybeSingle()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Returns the numeric id of a mess hall by code, or null if code is empty or row not found.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchMessHallIdByCodeFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ code: z.string() }))
	.handler(async ({ data }): Promise<number | null> => {
		if (!data.code) return null

		const { data: result, error } = await getSupabaseServerClient().schema("sisub").from("mess_halls").select("id").eq("code", data.code).maybeSingle()

		if (error) throw new Error(error.message)
		return result?.id ?? null
	})

/**
 * Checks if a user has a will_eat forecast for a specific date, meal and mess hall. Returns null if no forecast exists.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchUserMealForecastFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			userId: z.string(),
			date: z.string(),
			meal: z.string(),
			messHallId: z.number(),
		})
	)
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("meal_forecasts")
			.select("will_eat")
			.eq("user_id", data.userId)
			.eq("date", data.date)
			.eq("meal", data.meal as MealKey)
			.eq("mess_hall_id", data.messHallId)
			.maybeSingle()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Counts other_presences (admin-managed extra presences) for a meal slot using exact-count mode.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchOtherPresencesCountFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ date: z.string(), meal: z.string(), messHallId: z.number() }))
	.handler(async ({ data }): Promise<number> => {
		const { count, error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("other_presences")
			.select("*", { count: "exact", head: true })
			.eq("date", data.date)
			.eq("meal", data.meal)
			.eq("mess_hall_id", data.messHallId)

		if (error) throw new Error(error.message)
		return count ?? 0
	})

/**
 * Inserts an other_presence record attributing an extra presence to an admin for a meal slot.
 *
 * @remarks
 * SIDE EFFECTS: inserts into other_presences with admin_id.
 *
 * @throws {Error} on Supabase insert failure.
 */
export const addOtherPresenceFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			adminId: z.string(),
			date: z.string(),
			meal: z.string(),
			messHallId: z.number(),
		})
	)
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().schema("sisub").from("other_presences").insert({
			admin_id: data.adminId,
			date: data.date,
			meal: data.meal,
			mess_hall_id: data.messHallId,
		})

		if (error) throw new Error(error.message)
	})

/**
 * Resolves a user's display_name from the v_user_identity view. Returns null if not found or name is blank.
 */
export const resolveDisplayNameFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string() }))
	.handler(async ({ data }): Promise<string | null> => {
		const { data: result, error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("v_user_identity")
			.select("display_name")
			.eq("id", data.userId)
			.single()

		if (error || !result?.display_name) return null
		return result.display_name
	})
