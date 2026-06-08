import { z } from "zod"
import { UuidSchema } from "./common.ts"

export const ListFoldersSchema = z.object({
	includeDeleted: z.boolean().optional(),
})
export type ListFolders = z.infer<typeof ListFoldersSchema>

export const RestoreFolderSchema = z.object({ id: UuidSchema })
export type RestoreFolder = z.infer<typeof RestoreFolderSchema>

export const CreateFolderSchema = z.object({
	description: z.string().nullable().optional(),
	parentId: UuidSchema.nullable().optional(),
})
export type CreateFolder = z.infer<typeof CreateFolderSchema>

export const UpdateFolderSchema = CreateFolderSchema.extend({ id: UuidSchema })
export type UpdateFolder = z.infer<typeof UpdateFolderSchema>

export const DeleteFolderSchema = z.object({ id: UuidSchema })
export type DeleteFolder = z.infer<typeof DeleteFolderSchema>

export const ListIngredientsSchema = z.object({
	folderId: UuidSchema.optional(),
	includeDeleted: z.boolean().optional(),
})
export type ListIngredients = z.infer<typeof ListIngredientsSchema>

export const FetchIngredientSchema = z.object({ id: UuidSchema })
export type FetchIngredient = z.infer<typeof FetchIngredientSchema>

export const CreateIngredientSchema = z.object({
	description: z.string().min(1),
	folderId: UuidSchema.nullable().optional(),
	measureUnit: z.string().nullable().optional(),
	correctionFactor: z.number().nullable().optional(),
	ceafaId: UuidSchema.nullable().optional(),
})
export type CreateIngredient = z.infer<typeof CreateIngredientSchema>

export const UpdateIngredientSchema = CreateIngredientSchema.extend({ id: UuidSchema })
export type UpdateIngredient = z.infer<typeof UpdateIngredientSchema>

export const DeleteIngredientSchema = z.object({ id: UuidSchema })
export type DeleteIngredient = z.infer<typeof DeleteIngredientSchema>

export const RestoreIngredientSchema = z.object({ id: UuidSchema })
export type RestoreIngredient = z.infer<typeof RestoreIngredientSchema>

export const ListIngredientItemsSchema = z.object({
	ingredientId: UuidSchema.optional(),
})
export type ListIngredientItems = z.infer<typeof ListIngredientItemsSchema>

export const CreateIngredientItemSchema = z.object({
	ingredientId: UuidSchema.nullable().optional(),
	description: z.string().nullable().optional(),
	barcode: z.string().nullable().optional(),
	purchaseMeasureUnit: z.string().nullable().optional(),
	unitContentQuantity: z.number().nullable().optional(),
	correctionFactor: z.number().nullable().optional(),
	purchaseItemId: UuidSchema.nullable().optional(),
})
export type CreateIngredientItem = z.infer<typeof CreateIngredientItemSchema>

export const UpdateIngredientItemSchema = CreateIngredientItemSchema.extend({ id: UuidSchema })
export type UpdateIngredientItem = z.infer<typeof UpdateIngredientItemSchema>

export const DeleteIngredientItemSchema = z.object({ id: UuidSchema })
export type DeleteIngredientItem = z.infer<typeof DeleteIngredientItemSchema>

export const FetchIngredientNutrientsSchema = z.object({ ingredientId: UuidSchema })
export type FetchIngredientNutrients = z.infer<typeof FetchIngredientNutrientsSchema>

export const SetIngredientNutrientsSchema = z.object({
	ingredientId: UuidSchema,
	nutrients: z.array(
		z.object({
			nutrientId: UuidSchema,
			nutrientValue: z.number().nullable(),
		})
	),
})
export type SetIngredientNutrients = z.infer<typeof SetIngredientNutrientsSchema>

export const ListCeafaSchema = z.object({ search: z.string().optional() })
export type ListCeafa = z.infer<typeof ListCeafaSchema>

export const ListCatmatSchema = z.object({ search: z.string() })
export type ListCatmat = z.infer<typeof ListCatmatSchema>
