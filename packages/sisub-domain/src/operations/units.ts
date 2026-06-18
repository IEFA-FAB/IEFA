/**
 * Unit settings operations — UASG code + address fields.
 *
 * Auth posture preserved from the original server functions: authenticated
 * entrypoints with no module-level PBAC guard. `ctx` accepted for uniformity.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { FetchUnitSettings, UpdateUnitSettings } from "../schemas/units.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

export async function fetchUnitSettings(client: AnyClient, _ctx: UserContext, input: FetchUnitSettings) {
	const { data, error } = await client
		.from("units")
		.select(
			"id, code, display_name, type, uasg, address_logradouro, address_numero, address_complemento, address_bairro, address_municipio, address_uf, address_cep"
		)
		.eq("id", input.unitId)
		.single()
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data
}

export async function updateUnitSettings(client: AnyClient, _ctx: UserContext, input: UpdateUnitSettings) {
	const { error } = await client
		.from("units")
		.update({
			uasg: input.settings.uasg,
			address_logradouro: input.settings.address_logradouro,
			address_numero: input.settings.address_numero,
			address_complemento: input.settings.address_complemento,
			address_bairro: input.settings.address_bairro,
			address_municipio: input.settings.address_municipio,
			address_uf: input.settings.address_uf,
			address_cep: input.settings.address_cep,
		})
		.eq("id", input.unitId)
	if (error) throw new DomainError("UPDATE_FAILED", error.message)
	return { ok: true as const }
}
