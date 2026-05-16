/**
 * @module unit-settings.fn
 * Unit settings CRUD — UASG code and address fields.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLE: units (uasg + address_* fields).
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { getSupabaseServerClient } from "@/lib/supabase.server"

// ─── Schema ───────────────────────────────────────────────────────────────────

export const unitSettingsSchema = z.object({
	uasg: z.string().max(6, "UASG deve ter no máximo 6 dígitos").nullable(),
	address_logradouro: z.string().nullable(),
	address_numero: z.string().nullable(),
	address_complemento: z.string().nullable(),
	address_bairro: z.string().nullable(),
	address_municipio: z.string().nullable(),
	address_uf: z.string().max(2, "UF deve ter 2 letras").nullable(),
	address_cep: z.string().max(9, "CEP inválido").nullable(),
})

export type UnitSettingsInput = z.infer<typeof unitSettingsSchema>

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetches a unit's settings including UASG code and all address fields.
 *
 * @throws {Error} on Supabase query failure or not found (via .single()).
 */
export const fetchUnitSettingsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ unitId: z.number() }))
	.handler(async ({ data }) => {
		const { data: unit, error } = await getSupabaseServerClient()
			.from("units")
			.select(
				"id, code, display_name, type, uasg, address_logradouro, address_numero, address_complemento, address_bairro, address_municipio, address_uf, address_cep"
			)
			.eq("id", data.unitId)
			.single()

		if (error) throw new Error(error.message)
		return unit
	})

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Updates UASG code and all 7 address fields on a unit row (all fields replaced; null accepted for each).
 *
 * @remarks
 * SIDE EFFECTS: writes uasg + address_* columns on units.
 *
 * @throws {Error} on Supabase update failure.
 */
export const updateUnitSettingsFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ unitId: z.number(), settings: unitSettingsSchema }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getSupabaseServerClient()
			.from("units")
			.update({
				uasg: data.settings.uasg,
				address_logradouro: data.settings.address_logradouro,
				address_numero: data.settings.address_numero,
				address_complemento: data.settings.address_complemento,
				address_bairro: data.settings.address_bairro,
				address_municipio: data.settings.address_municipio,
				address_uf: data.settings.address_uf,
				address_cep: data.settings.address_cep,
			})
			.eq("id", data.unitId)

		if (error) throw new Error(error.message)
		return { ok: true }
	})
