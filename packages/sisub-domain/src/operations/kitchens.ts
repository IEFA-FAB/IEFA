import type { SupabaseClient } from "@supabase/supabase-js"
import { requirePermission } from "../guards/require-permission.ts"
import type { ListUnitKitchens } from "../schemas/kitchens.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

export async function listKitchens(client: AnyClient, ctx: UserContext) {
	requirePermission(ctx, "kitchen", 1)

	const { data, error } = await client.from("kitchen").select(`*, unit:units!kitchen_unit_id_fkey(id, display_name, code)`).order("id")
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data ?? []
}

export async function listUnitKitchens(client: AnyClient, ctx: UserContext, input: ListUnitKitchens) {
	requirePermission(ctx, "kitchen", 1)

	const { data, error } = await client.from("kitchen").select("id, display_name").eq("unit_id", input.unitId).order("display_name")
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data ?? []
}
