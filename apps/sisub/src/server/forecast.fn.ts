import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"

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

export const persistDefaultMessHallFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			userId: z.string(),
			email: z.string(),
			messHallId: z.number(),
		})
	)
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("user_data")
			.upsert({ id: data.userId, default_mess_hall_id: data.messHallId, email: data.email }, { onConflict: "id", ignoreDuplicates: false })

		if (error) throw new Error(error.message)
	})

export const upsertForecastFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			userId: z.string(),
			date: z.string(),
			meal: z.string(),
			willEat: z.boolean(),
			messHallId: z.number(),
		})
	)
	.handler(async ({ data }) => {
		const { error: upsertError } = await getSupabaseServerClient().schema("sisub").from("meal_forecasts").upsert(
			{
				date: data.date,
				user_id: data.userId,
				meal: data.meal,
				will_eat: data.willEat,
				mess_hall_id: data.messHallId,
			},
			{ onConflict: "user_id,date,meal", ignoreDuplicates: false }
		)

		if (upsertError) {
			// fallback: delete + insert
			await getSupabaseServerClient().schema("sisub").from("meal_forecasts").delete().eq("user_id", data.userId).eq("date", data.date).eq("meal", data.meal)

			const { error: insertError } = await getSupabaseServerClient().schema("sisub").from("meal_forecasts").insert({
				date: data.date,
				user_id: data.userId,
				meal: data.meal,
				will_eat: data.willEat,
				mess_hall_id: data.messHallId,
			})

			if (insertError) throw new Error(insertError.message)
		}
	})

export const deleteForecastFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ userId: z.string(), date: z.string(), meal: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("meal_forecasts")
			.delete()
			.eq("user_id", data.userId)
			.eq("date", data.date)
			.eq("meal", data.meal)

		if (error && !error.message?.includes("No rows deleted")) {
			throw new Error(error.message)
		}
	})
