import type { SupabaseClient } from "@supabase/supabase-js"
import { requirePermission } from "../guards/require-permission.ts"
import type { FetchKitchenSettings, ListUnitKitchens, UpdateKitchenSettings } from "../schemas/kitchens.ts"
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

// ─── Kitchen address settings ───────────────────────────────────────────────
// Auth posture preserved from the original server functions: authenticated
// entrypoints with no module-level PBAC guard. `ctx` accepted for uniformity.

export async function fetchKitchenSettings(client: AnyClient, _ctx: UserContext, input: FetchKitchenSettings) {
	const { data, error } = await client
		.from("kitchen")
		.select(
			`id, display_name, type,
			 address_logradouro, address_numero, address_complemento,
			 address_bairro, address_municipio, address_uf, address_cep,
			 unit:units!kitchen_unit_id_fkey(id, code, display_name)`
		)
		.eq("id", input.kitchenId)
		.single()
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data
}

export async function updateKitchenSettings(client: AnyClient, _ctx: UserContext, input: UpdateKitchenSettings) {
	const { error } = await client
		.from("kitchen")
		.update({
			address_logradouro: input.settings.address_logradouro,
			address_numero: input.settings.address_numero,
			address_complemento: input.settings.address_complemento,
			address_bairro: input.settings.address_bairro,
			address_municipio: input.settings.address_municipio,
			address_uf: input.settings.address_uf,
			address_cep: input.settings.address_cep,
		})
		.eq("id", input.kitchenId)
	if (error) throw new DomainError("UPDATE_FAILED", error.message)
	return { ok: true as const }
}
