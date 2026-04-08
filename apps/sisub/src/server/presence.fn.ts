import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { MealKey } from "@/types/domain/meal"
import type { FiscalPresenceRecord, ForecastMap, ForecastRow } from "@/types/domain/presence"

export const fetchPresencesFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			date: z.string(),
			meal: z.string(),
			messHallId: z.number(),
		})
	)
	.handler(async ({ data }) => {
		type PresenceRowWithUser = {
			id: string
			user_id: string
			date: string
			meal: MealKey
			created_at: string
			mess_hall_id: number
			display_name: string | null
		}

		const { data: result, error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("v_meal_presences_with_user")
			.select("id, user_id, date, meal, created_at, mess_hall_id, display_name")
			.eq("date", data.date)
			.eq("meal", data.meal)
			.eq("mess_hall_id", data.messHallId)
			.order("created_at", { ascending: false })
			.returns<PresenceRowWithUser[]>()

		if (error) throw new Error(error.message)

		return (result ?? []).map((r) => {
			const base: FiscalPresenceRecord = {
				id: r.id,
				user_id: r.user_id,
				date: r.date,
				meal: r.meal,
				created_at: r.created_at,
				mess_hall_id: r.mess_hall_id,
				updated_at: null,
				unidade: String(data.messHallId),
			}
			return Object.assign(base, { display_name: r.display_name ?? null })
		})
	})

export const fetchForecastsFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			date: z.string(),
			meal: z.string(),
			messHallId: z.number(),
			userIds: z.array(z.string()),
		})
	)
	.handler(async ({ data }) => {
		if (data.userIds.length === 0) return {} as ForecastMap

		const { data: result, error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("meal_forecasts")
			.select("user_id, will_eat")
			.eq("date", data.date)
			.eq("meal", data.meal)
			.eq("mess_hall_id", data.messHallId)
			.in("user_id", data.userIds)
			.returns<ForecastRow[]>()

		if (error) return {} as ForecastMap

		const forecastMap: ForecastMap = {}
		;(result ?? []).forEach((row) => {
			forecastMap[row.user_id] = Boolean(row.will_eat)
		})

		return forecastMap
	})

export const insertPresenceFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			user_id: z.string(),
			date: z.string(),
			meal: z.string(),
			messHallId: z.number(),
		})
	)
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().schema("sisub").from("meal_presences").insert({
			user_id: data.user_id,
			date: data.date,
			meal: data.meal,
			mess_hall_id: data.messHallId,
		})

		if (error) throw Object.assign(new Error(error.message), { code: error.code })
	})

export const deletePresenceFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().schema("sisub").from("meal_presences").delete().eq("id", data.id)

		if (error) throw new Error(error.message)
	})
