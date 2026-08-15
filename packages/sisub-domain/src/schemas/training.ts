import { z } from "zod"

export const ListTrainingResetsSchema = z.object({
	limit: z.number().int().positive().max(100).optional(),
})
export type ListTrainingResets = z.infer<typeof ListTrainingResetsSchema>
