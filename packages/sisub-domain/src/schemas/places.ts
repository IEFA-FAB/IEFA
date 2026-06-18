import { z } from "zod"

// Org-hierarchy reads (units / mess_halls / places graph) take no input.

export const UpdatePlacesEntitySchema = z.discriminatedUnion("entityType", [
	z.object({
		entityType: z.literal("unit"),
		id: z.number(),
		display_name: z.string().min(1, "Nome é obrigatório"),
		code: z.string().min(1, "Código é obrigatório"),
		type: z.enum(["consumption", "purchase"]).nullable(),
	}),
	z.object({
		entityType: z.literal("kitchen"),
		id: z.number(),
		display_name: z.string().min(1, "Nome é obrigatório"),
		type: z.enum(["consumption", "production"]).nullable(),
	}),
	z.object({
		entityType: z.literal("mess_hall"),
		id: z.number(),
		display_name: z.string().min(1, "Nome é obrigatório"),
		code: z.string().min(1, "Código é obrigatório"),
	}),
])
export type UpdateEntityInput = z.infer<typeof UpdatePlacesEntitySchema>

export const PlacesDiffItemSchema = z.discriminatedUnion("table", [
	z.object({
		table: z.literal("kitchen"),
		recordId: z.number(),
		column: z.enum(["unit_id", "purchase_unit_id", "kitchen_id"]),
		newValue: z.number(),
	}),
	z.object({
		table: z.literal("mess_halls"),
		recordId: z.number(),
		column: z.enum(["unit_id", "kitchen_id"]),
		newValue: z.number(),
	}),
])
export type PlacesDiffItem = z.infer<typeof PlacesDiffItemSchema>

export const ApplyPlacesDiffSchema = z.object({ diffs: z.array(PlacesDiffItemSchema) })
export type ApplyPlacesDiff = z.infer<typeof ApplyPlacesDiffSchema>

export const FetchMessHallByCodeSchema = z.object({ code: z.string() })
export type FetchMessHallByCode = z.infer<typeof FetchMessHallByCodeSchema>

export const FetchUserMealForecastSchema = z.object({
	userId: z.string(),
	date: z.string(),
	meal: z.string(),
	messHallId: z.number(),
})
export type FetchUserMealForecast = z.infer<typeof FetchUserMealForecastSchema>

export const FetchOtherPresencesCountSchema = z.object({
	date: z.string(),
	meal: z.string(),
	messHallId: z.number(),
})
export type FetchOtherPresencesCount = z.infer<typeof FetchOtherPresencesCountSchema>

export const AddOtherPresenceSchema = z.object({
	adminId: z.string(),
	date: z.string(),
	meal: z.string(),
	messHallId: z.number(),
})
export type AddOtherPresence = z.infer<typeof AddOtherPresenceSchema>

export const ResolveDisplayNameSchema = z.object({ userId: z.string() })
export type ResolveDisplayName = z.infer<typeof ResolveDisplayNameSchema>
