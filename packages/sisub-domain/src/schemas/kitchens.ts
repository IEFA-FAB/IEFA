import { z } from "zod"
import { AddressFieldsSchema, KitchenIdSchema } from "./common.ts"

export const ListKitchensSchema = z.object({})
export type ListKitchens = z.infer<typeof ListKitchensSchema>

export const ListUnitKitchensSchema = z.object({
	unitId: KitchenIdSchema,
})
export type ListUnitKitchens = z.infer<typeof ListUnitKitchensSchema>

export const KitchenSettingsSchema = AddressFieldsSchema
export type KitchenSettingsInput = z.infer<typeof KitchenSettingsSchema>

export const FetchKitchenSettingsSchema = z.object({ kitchenId: z.number() })
export type FetchKitchenSettings = z.infer<typeof FetchKitchenSettingsSchema>

export const UpdateKitchenSettingsSchema = z.object({ kitchenId: z.number(), settings: KitchenSettingsSchema })
export type UpdateKitchenSettings = z.infer<typeof UpdateKitchenSettingsSchema>
