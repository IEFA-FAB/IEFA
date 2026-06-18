/**
 * Diner meal-forecast operations (will_eat intent per date+meal).
 *
 * Auth posture preserved from the original server functions, with no
 * module-level PBAC guard. Mutations are authenticated and act on the caller's
 * own identity (ctx.userId); reads are unauthenticated (matching the original)
 * and take an explicit userId. Schema: sisub (explicit .schema("sisub")).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { DeleteForecast, GetUserDefaultMessHall, ListMealForecasts, PersistDefaultMessHall, UpsertForecast } from "../schemas/meal-ops.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

export async function listMealForecasts(client: AnyClient, input: ListMealForecasts) {
	const { data, error } = await client
		.schema("sisub")
		.from("meal_forecasts")
		.select("date, meal, will_eat, mess_halls(code)")
		.eq("user_id", input.userId)
		.gte("date", input.startDate)
		.lte("date", input.endDate)
		.order("date", { ascending: true })
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data ?? []
}

export async function getUserDefaultMessHall(client: AnyClient, input: GetUserDefaultMessHall) {
	const { data, error } = await client.schema("sisub").from("user_data").select("default_mess_hall_id").eq("id", input.userId).maybeSingle()
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data ?? null
}

export async function persistDefaultMessHall(client: AnyClient, ctx: UserContext, input: PersistDefaultMessHall) {
	const { error } = await client
		.schema("sisub")
		.from("user_data")
		.upsert({ id: ctx.userId, default_mess_hall_id: input.messHallId, email: input.email }, { onConflict: "id", ignoreDuplicates: false })
	if (error) throw new DomainError("UPSERT_FAILED", error.message)
}

export async function upsertForecast(client: AnyClient, ctx: UserContext, input: UpsertForecast) {
	const row = {
		date: input.date,
		user_id: ctx.userId,
		meal: input.meal,
		will_eat: input.willEat,
		mess_hall_id: input.messHallId,
	}

	const { error: upsertError } = await client.schema("sisub").from("meal_forecasts").upsert(row, { onConflict: "user_id,date,meal", ignoreDuplicates: false })

	if (upsertError) {
		// Fallback: delete + insert — handles edge cases onConflict can't resolve.
		await client.schema("sisub").from("meal_forecasts").delete().eq("user_id", ctx.userId).eq("date", input.date).eq("meal", input.meal)
		const { error: insertError } = await client.schema("sisub").from("meal_forecasts").insert(row)
		if (insertError) throw new DomainError("UPSERT_FAILED", insertError.message)
	}
}

export async function deleteForecast(client: AnyClient, ctx: UserContext, input: DeleteForecast) {
	const { error } = await client.schema("sisub").from("meal_forecasts").delete().eq("user_id", ctx.userId).eq("date", input.date).eq("meal", input.meal)
	if (error && !error.message?.includes("No rows deleted")) {
		throw new DomainError("DELETE_FAILED", error.message)
	}
}
