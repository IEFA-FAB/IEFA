import { z } from "zod"
import { KitchenIdSchema } from "./common.ts"

export const FetchProcurementNeedsSchema = z.object({
	startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
	endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
	kitchenId: KitchenIdSchema.optional(),
	unitId: KitchenIdSchema.optional(),
})
export type FetchProcurementNeeds = z.infer<typeof FetchProcurementNeedsSchema>
