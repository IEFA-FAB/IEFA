import { z } from "zod"
import { KitchenIdSchema } from "./common.ts"

export const ListKitchensSchema = z.object({})
export type ListKitchens = z.infer<typeof ListKitchensSchema>

export const ListUnitKitchensSchema = z.object({
	unitId: KitchenIdSchema,
})
export type ListUnitKitchens = z.infer<typeof ListUnitKitchensSchema>
