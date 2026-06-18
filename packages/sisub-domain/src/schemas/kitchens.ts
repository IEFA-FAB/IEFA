import { z } from "zod"
import { KitchenIdSchema } from "./common.ts"

export const ListKitchensSchema = z.object({})
export type ListKitchens = z.infer<typeof ListKitchensSchema>

export const ListUnitKitchensSchema = z.object({
	unitId: KitchenIdSchema,
})
export type ListUnitKitchens = z.infer<typeof ListUnitKitchensSchema>

export const KitchenSettingsSchema = z.object({
	address_logradouro: z.string().nullable(),
	address_numero: z.string().nullable(),
	address_complemento: z.string().nullable(),
	address_bairro: z.string().nullable(),
	address_municipio: z.string().nullable(),
	address_uf: z.string().max(2, "UF deve ter 2 letras").nullable(),
	address_cep: z.string().max(9, "CEP inválido").nullable(),
})
export type KitchenSettingsInput = z.infer<typeof KitchenSettingsSchema>

export const FetchKitchenSettingsSchema = z.object({ kitchenId: z.number() })
export type FetchKitchenSettings = z.infer<typeof FetchKitchenSettingsSchema>

export const UpdateKitchenSettingsSchema = z.object({ kitchenId: z.number(), settings: KitchenSettingsSchema })
export type UpdateKitchenSettings = z.infer<typeof UpdateKitchenSettingsSchema>
