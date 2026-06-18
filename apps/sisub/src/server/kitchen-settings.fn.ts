/**
 * @module kitchen-settings.fn
 * Kitchen address settings CRUD.
 * Thin wrappers over @iefa/sisub-domain (operations/kitchens).
 * @domain core
 * @migration done
 */

import {
	FetchKitchenSettingsSchema,
	fetchKitchenSettings,
	type KitchenSettingsInput,
	UpdateKitchenSettingsSchema,
	updateKitchenSettings,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"

export type { KitchenSettingsInput }

/** Kitchen detail with address fields and the (to-one) parent unit relation. */
type KitchenSettingsResult = {
	id: number
	display_name: string | null
	type: string | null
	address_logradouro: string | null
	address_numero: string | null
	address_complemento: string | null
	address_bairro: string | null
	address_municipio: string | null
	address_uf: string | null
	address_cep: string | null
	unit: { id: number; code: string | null; display_name: string | null } | null
}

export const fetchKitchenSettingsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchKitchenSettingsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return (await fetchKitchenSettings(getSupabaseServerClient(), ctx, data).catch(handleDomainError)) as unknown as KitchenSettingsResult
	})

export const updateKitchenSettingsFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateKitchenSettingsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateKitchenSettings(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})
