import { z } from "zod"
import { AddressFieldsSchema } from "./common.ts"

export const UnitSettingsSchema = AddressFieldsSchema.extend({
	uasg: z.string().max(6, "UASG deve ter no máximo 6 dígitos").nullable(),
})
export type UnitSettingsInput = z.infer<typeof UnitSettingsSchema>

export const FetchUnitSettingsSchema = z.object({ unitId: z.number() })
export type FetchUnitSettings = z.infer<typeof FetchUnitSettingsSchema>

export const UpdateUnitSettingsSchema = z.object({ unitId: z.number(), settings: UnitSettingsSchema })
export type UpdateUnitSettings = z.infer<typeof UpdateUnitSettingsSchema>
