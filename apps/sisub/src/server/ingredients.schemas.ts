import { z } from "zod"

export const FolderWriteSchema = z.object({
	description: z.string().nullable().optional(),
	parent_id: z.string().nullable().optional(),
})

export const IngredientWriteSchema = z.object({
	description: z.string().min(1, "Descrição obrigatória").nullable().optional(),
	folder_id: z.string().uuid("folder_id deve ser UUID válido").nullable().optional(),
	measure_unit: z.string().nullable().optional(),
	correction_factor: z.number().nullable().optional(),
	ceafa_id: z.string().uuid("ceafa_id deve ser UUID válido").nullable().optional(),
})

export const IngredientItemWriteSchema = z.object({
	ingredient_id: z.string().uuid().nullable().optional(),
	description: z.string().nullable().optional(),
	barcode: z.string().nullable().optional(),
	purchase_measure_unit: z.string().nullable().optional(),
	unit_content_quantity: z.number().nullable().optional(),
	correction_factor: z.number().nullable().optional(),
})

export type IngredientWrite = z.infer<typeof IngredientWriteSchema>
export type IngredientItemWrite = z.infer<typeof IngredientItemWriteSchema>
