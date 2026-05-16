/**
 * @module forecast.fn
 * Meal forecast management for individual diners (will_eat intent per date+meal).
 * CLIENT: getSupabaseServerClient (service role). Schema: sisub (explicit .schema("sisub")) on all functions.
 * TABLES: meal_forecasts, user_data (schema sisub).
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireUserId } from "@/lib/auth.server"
import { getSupabaseServerClient } from "@/lib/supabase.server"

/**
 * Lists meal forecasts for a user in a date range ordered by date ascending, with mess_hall code joined.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchMealForecastsFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			userId: z.string(),
			startDate: z.string(),
			endDate: z.string(),
		})
	)
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("meal_forecasts")
			.select("date, meal, will_eat, mess_halls(code)")
			.eq("user_id", data.userId)
			.gte("date", data.startDate)
			.lte("date", data.endDate)
			.order("date", { ascending: true })

		if (error) throw new Error(error.message)
		return result ?? []
	})

/**
 * Returns the default_mess_hall_id for a user, or null if not set.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchUserDefaultMessHallFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("user_data")
			.select("default_mess_hall_id")
			.eq("id", data.userId)
			.maybeSingle()

		if (error) throw new Error(error.message)
		return result ?? null
	})

/**
 * Upserts the user's default mess hall preference (conflict on id, ignoreDuplicates=false overrides existing value).
 *
 * @remarks
 * SIDE EFFECTS: upserts sisub.user_data.default_mess_hall_id.
 *
 * @throws {Error} on Supabase upsert failure.
 */
export const persistDefaultMessHallFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			email: z.string(),
			messHallId: z.number(),
		})
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const { error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("user_data")
			.upsert({ id: userId, default_mess_hall_id: data.messHallId, email: data.email }, { onConflict: "id", ignoreDuplicates: false })

		if (error) throw new Error(error.message)
	})

/**
 * Saves or updates a meal forecast, falling back to delete+insert if upsert fails due to a conflict it can't resolve.
 *
 * @remarks
 * SIDE EFFECTS: writes to sisub.meal_forecasts (conflict on user_id+date+meal).
 * Fallback: on upsert error, deletes the conflicting row and re-inserts — handles edge cases not caught by onConflict.
 *
 * @throws {Error} only if both upsert and fallback insert fail.
 */
export const upsertForecastFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			date: z.string(),
			meal: z.string(),
			willEat: z.boolean(),
			messHallId: z.number(),
		})
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const { error: upsertError } = await getSupabaseServerClient().schema("sisub").from("meal_forecasts").upsert(
			{
				date: data.date,
				user_id: userId,
				meal: data.meal,
				will_eat: data.willEat,
				mess_hall_id: data.messHallId,
			},
			{ onConflict: "user_id,date,meal", ignoreDuplicates: false }
		)

		if (upsertError) {
			// fallback: delete + insert
			await getSupabaseServerClient().schema("sisub").from("meal_forecasts").delete().eq("user_id", userId).eq("date", data.date).eq("meal", data.meal)

			const { error: insertError } = await getSupabaseServerClient().schema("sisub").from("meal_forecasts").insert({
				date: data.date,
				user_id: userId,
				meal: data.meal,
				will_eat: data.willEat,
				mess_hall_id: data.messHallId,
			})

			if (insertError) throw new Error(insertError.message)
		}
	})

/**
 * Deletes a specific meal forecast for a user. Silently ignores "No rows deleted" errors.
 *
 * @throws {Error} on Supabase delete failure (excluding no-rows-deleted).
 */
export const deleteForecastFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ date: z.string(), meal: z.string() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const { error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("meal_forecasts")
			.delete()
			.eq("user_id", userId)
			.eq("date", data.date)
			.eq("meal", data.meal)

		if (error && !error.message?.includes("No rows deleted")) {
			throw new Error(error.message)
		}
	})
