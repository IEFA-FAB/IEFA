/**
 * Org-hierarchy + mess-hall operations.
 *
 * Auth posture preserved from the original server functions: these are
 * authenticated entrypoints (the caller runs requireAuth()) but carry no
 * module-level PBAC guard — they read/write global reference data and
 * diner-facing presence rows. `ctx` is accepted for signature uniformity.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
	AddOtherPresence,
	ApplyPlacesDiff,
	FetchMessHallByCode,
	FetchOtherPresencesCount,
	FetchUserMealForecast,
	ResolveDisplayName,
	UpdateEntityInput,
} from "../schemas/places.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

// ─── Reference reads ────────────────────────────────────────────────────────

export async function listUnits(client: AnyClient, _ctx: UserContext) {
	const { data, error } = await client.from("units").select("id, code, display_name").order("display_name", { ascending: true })
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return (data ?? []).map((row: { id: number; code: string | null; display_name: string | null }) => ({
		id: row.id,
		code: row.code,
		display_name: row.display_name,
		type: null,
	}))
}

export async function listAllMessHalls(client: AnyClient, _ctx: UserContext) {
	const { data, error } = await client.from("mess_halls").select("id, unit_id, code, display_name, kitchen_id").order("display_name", { ascending: true })
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data ?? []
}

export async function fetchPlacesGraph(client: AnyClient, _ctx: UserContext) {
	const [unitsRes, kitchensRes, messHallsRes] = await Promise.all([
		client.from("units").select("*").order("display_name"),
		client.from("kitchen").select("*").order("display_name"),
		client.from("mess_halls").select("*").order("display_name"),
	])

	if (unitsRes.error) throw new DomainError("FETCH_FAILED", unitsRes.error.message)
	if (kitchensRes.error) throw new DomainError("FETCH_FAILED", kitchensRes.error.message)
	if (messHallsRes.error) throw new DomainError("FETCH_FAILED", messHallsRes.error.message)

	return {
		units: unitsRes.data ?? [],
		kitchens: kitchensRes.data ?? [],
		messHalls: messHallsRes.data ?? [],
	}
}

// ─── Org-graph mutations ────────────────────────────────────────────────────

export async function updatePlacesEntity(client: AnyClient, _ctx: UserContext, input: UpdateEntityInput) {
	if (input.entityType === "unit") {
		const { error } = await client.from("units").update({ display_name: input.display_name, code: input.code, type: input.type }).eq("id", input.id)
		if (error) throw new DomainError("UPDATE_FAILED", error.message)
	} else if (input.entityType === "kitchen") {
		const { error } = await client.from("kitchen").update({ display_name: input.display_name, type: input.type }).eq("id", input.id)
		if (error) throw new DomainError("UPDATE_FAILED", error.message)
	} else {
		const { error } = await client.from("mess_halls").update({ display_name: input.display_name, code: input.code }).eq("id", input.id)
		if (error) throw new DomainError("UPDATE_FAILED", error.message)
	}
	return { ok: true as const }
}

export async function applyPlacesDiff(client: AnyClient, _ctx: UserContext, input: ApplyPlacesDiff) {
	await Promise.all(
		input.diffs.map(async (diff) => {
			const update = { [diff.column]: diff.newValue }
			const { error } =
				diff.table === "kitchen"
					? await client.from("kitchen").update(update).eq("id", diff.recordId)
					: await client.from("mess_halls").update(update).eq("id", diff.recordId)
			if (error) throw new DomainError("UPDATE_FAILED", `Falha ao atualizar ${diff.table} (id ${diff.recordId}): ${error.message}`)
		})
	)
	return { ok: true as const, count: input.diffs.length }
}

// ─── Mess-hall lookups + diner presence ─────────────────────────────────────

export async function fetchMessHallByCode(client: AnyClient, _ctx: UserContext, input: FetchMessHallByCode) {
	const { data, error } = await client.schema("sisub").from("mess_halls").select("id, unit_id, code, display_name").eq("code", input.code).maybeSingle()
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data
}

export async function fetchMessHallIdByCode(client: AnyClient, _ctx: UserContext, input: FetchMessHallByCode): Promise<number | null> {
	if (!input.code) return null
	const { data, error } = await client.schema("sisub").from("mess_halls").select("id").eq("code", input.code).maybeSingle()
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data?.id ?? null
}

export async function fetchUserMealForecast(client: AnyClient, _ctx: UserContext, input: FetchUserMealForecast) {
	const { data, error } = await client
		.schema("sisub")
		.from("meal_forecasts")
		.select("will_eat")
		.eq("user_id", input.userId)
		.eq("date", input.date)
		.eq("meal", input.meal)
		.eq("mess_hall_id", input.messHallId)
		.maybeSingle()
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data
}

export async function fetchOtherPresencesCount(client: AnyClient, _ctx: UserContext, input: FetchOtherPresencesCount): Promise<number> {
	const { count, error } = await client
		.schema("sisub")
		.from("other_presences")
		.select("*", { count: "exact", head: true })
		.eq("date", input.date)
		.eq("meal", input.meal)
		.eq("mess_hall_id", input.messHallId)
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return count ?? 0
}

export async function addOtherPresence(client: AnyClient, _ctx: UserContext, input: AddOtherPresence) {
	const { error } = await client.schema("sisub").from("other_presences").insert({
		admin_id: input.adminId,
		date: input.date,
		meal: input.meal,
		mess_hall_id: input.messHallId,
	})
	if (error) throw new DomainError("INSERT_FAILED", error.message)
}

export async function resolveDisplayName(client: AnyClient, _ctx: UserContext, input: ResolveDisplayName): Promise<string | null> {
	const { data, error } = await client.schema("sisub").from("v_user_identity").select("display_name").eq("id", input.userId).single()
	if (error || !data?.display_name) return null
	return data.display_name
}
