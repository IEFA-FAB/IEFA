/**
 * Fiscal presence operations: read presences + forecasts, insert/delete presence.
 *
 * Auth posture preserved from the original server functions: authenticated
 * entrypoints with no module-level PBAC guard. Schema: sisub.
 *
 * insertPresence intentionally throws a code-bearing Error (not a DomainError)
 * so callers can detect PG unique violations (code "23505"); its server fn must
 * propagate the raw error instead of mapping it through handleDomainError.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { InsertPresence, ListForecastMap, ListPresences } from "../schemas/meal-ops.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

type PresenceRowWithUser = {
	id: string
	user_id: string
	date: string
	meal: string
	created_at: string
	mess_hall_id: number
	display_name: string | null
}

export async function listPresences(client: AnyClient, _ctx: UserContext, input: ListPresences) {
	const { data, error } = await client
		.schema("sisub")
		.from("v_meal_presences_with_user")
		.select("id, user_id, date, meal, created_at, mess_hall_id, display_name")
		.eq("date", input.date)
		.eq("meal", input.meal)
		.eq("mess_hall_id", input.messHallId)
		.order("created_at", { ascending: false })
		.returns<PresenceRowWithUser[]>()

	if (error) throw new DomainError("FETCH_FAILED", error.message)

	return (data ?? []).map((r) => ({
		id: r.id,
		user_id: r.user_id,
		date: r.date,
		meal: r.meal,
		created_at: r.created_at,
		mess_hall_id: r.mess_hall_id,
		updated_at: null,
		unidade: String(input.messHallId),
		display_name: r.display_name ?? null,
	}))
}

export async function listForecastMap(client: AnyClient, _ctx: UserContext, input: ListForecastMap): Promise<Record<string, boolean>> {
	if (input.userIds.length === 0) return {}

	const { data, error } = await client
		.schema("sisub")
		.from("meal_forecasts")
		.select("user_id, will_eat")
		.eq("date", input.date)
		.eq("meal", input.meal)
		.eq("mess_hall_id", input.messHallId)
		.in("user_id", input.userIds)
		.returns<Array<{ user_id: string; will_eat: boolean | null }>>()

	// Non-throwing by design: caller treats a missing forecast as unknown.
	if (error) return {}

	const map: Record<string, boolean> = {}
	for (const row of data ?? []) {
		map[row.user_id] = Boolean(row.will_eat)
	}
	return map
}

export async function insertPresence(client: AnyClient, _ctx: UserContext, input: InsertPresence) {
	const { error } = await client.schema("sisub").from("meal_presences").insert({
		user_id: input.user_id,
		date: input.date,
		meal: input.meal,
		mess_hall_id: input.messHallId,
	})

	// Preserve PG error code (e.g. "23505" duplicate) for caller-side handling.
	if (error) throw Object.assign(new Error(error.message), { code: error.code })
}

export async function deletePresence(client: AnyClient, _ctx: UserContext, input: { id: string }) {
	const { error } = await client.schema("sisub").from("meal_presences").delete().eq("id", input.id)
	if (error) throw new DomainError("DELETE_FAILED", error.message)
}
