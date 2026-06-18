import { z } from "zod"

export const UnitSettingsSchema = z.object({
	uasg: z.string().max(6, "UASG deve ter no máximo 6 dígitos").nullable(),
	address_logradouro: z.string().nullable(),
	address_numero: z.string().nullable(),
	address_complemento: z.string().nullable(),
	address_bairro: z.string().nullable(),
	address_municipio: z.string().nullable(),
	address_uf: z.string().max(2, "UF deve ter 2 letras").nullable(),
	address_cep: z.string().max(9, "CEP inválido").nullable(),
})
export type UnitSettingsInput = z.infer<typeof UnitSettingsSchema>

export const FetchUnitSettingsSchema = z.object({ unitId: z.number() })
export type FetchUnitSettings = z.infer<typeof FetchUnitSettingsSchema>

export const UpdateUnitSettingsSchema = z.object({ unitId: z.number(), settings: UnitSettingsSchema })
export type UpdateUnitSettings = z.infer<typeof UpdateUnitSettingsSchema>
