import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"

// ─── Schema ───────────────────────────────────────────────────────────────────

export const kitchenSettingsSchema = z.object({
	address_logradouro: z.string().nullable(),
	address_numero: z.string().nullable(),
	address_complemento: z.string().nullable(),
	address_bairro: z.string().nullable(),
	address_municipio: z.string().nullable(),
	address_uf: z.string().max(2, "UF deve ter 2 letras").nullable(),
	address_cep: z.string().max(9, "CEP inválido").nullable(),
})

export type KitchenSettingsInput = z.infer<typeof kitchenSettingsSchema>

// ─── Fetch ────────────────────────────────────────────────────────────────────

export const fetchKitchenSettingsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number() }))
	.handler(async ({ data }) => {
		const { data: kitchen, error } = await getSupabaseServerClient()
			.from("kitchen")
			.select(
				`id, display_name, type,
				 address_logradouro, address_numero, address_complemento,
				 address_bairro, address_municipio, address_uf, address_cep,
				 unit:units!kitchen_unit_id_fkey(id, code, display_name)`
			)
			.eq("id", data.kitchenId)
			.single()

		if (error) throw new Error(error.message)
		return kitchen
	})

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateKitchenSettingsFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ kitchenId: z.number(), settings: kitchenSettingsSchema }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.from("kitchen")
			.update({
				address_logradouro: data.settings.address_logradouro,
				address_numero: data.settings.address_numero,
				address_complemento: data.settings.address_complemento,
				address_bairro: data.settings.address_bairro,
				address_municipio: data.settings.address_municipio,
				address_uf: data.settings.address_uf,
				address_cep: data.settings.address_cep,
			})
			.eq("id", data.kitchenId)

		if (error) throw new Error(error.message)
		return { ok: true }
	})
