import { z } from "zod"
import { KitchenIdSchema, UuidSchema } from "./common.ts"

export const FetchMealTypesSchema = z.object({
	kitchenId: KitchenIdSchema.nullable().optional(),
})
export type FetchMealTypes = z.infer<typeof FetchMealTypesSchema>

export const CreateMealTypeSchema = z.object({
	name: z.string().min(1),
	sortOrder: z.number().int().nonnegative().optional(),
	kitchenId: KitchenIdSchema.nullable().optional(),
})
export type CreateMealType = z.infer<typeof CreateMealTypeSchema>

export const UpdateMealTypeSchema = z.object({
	mealTypeId: UuidSchema,
	name: z.string().min(1).optional(),
	sortOrder: z.number().int().nonnegative().optional(),
	kitchenId: KitchenIdSchema.nullable().optional(),
})
export type UpdateMealType = z.infer<typeof UpdateMealTypeSchema>

export const DeleteMealTypeSchema = z.object({
	mealTypeId: UuidSchema,
})
export type DeleteMealType = z.infer<typeof DeleteMealTypeSchema>

export const RestoreMealTypeSchema = z.object({
	mealTypeId: UuidSchema,
})
export type RestoreMealType = z.infer<typeof RestoreMealTypeSchema>
