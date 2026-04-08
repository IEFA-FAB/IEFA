import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { MealKey } from "@/types/domain/meal"

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

export const fetchMessHallIdByCodeFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ code: z.string() }))
	.handler(async ({ data }): Promise<number | null> => {
		if (!data.code) return null

		const { data: result, error } = await getSupabaseServerClient().schema("sisub").from("mess_halls").select("id").eq("code", data.code).maybeSingle()

		if (error) throw new Error(error.message)
		return result?.id ?? null
	})

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
