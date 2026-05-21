import { z } from "zod"

export const PurchaseItemWriteSchema = z.object({
	description: z.string().min(1, "Descrição obrigatória"),
	purchase_measure_unit: z.string().nullable().optional(),
	catmat_item_codigo: z.number().int().positive().nullable().optional(),
	catmat_item_descricao: z.string().nullable().optional(),
	catmat_match_status: z.enum(["pending", "matched", "review", "no_match", "skip"]).nullable().optional(),
	catmat_match_score: z.number().min(0).max(1).nullable().optional(),
	gpc_segment_code: z.string().nullable().optional(),
	gpc_family_code: z.string().nullable().optional(),
	gpc_class_code: z.string().nullable().optional(),
	gpc_brick_code: z.string().nullable().optional(),
	unit_price: z.number().positive().nullable().optional(),
})

export const PurchaseItemIngredientWriteSchema = z.object({
	purchase_item_id: z.string().uuid(),
	ingredient_id: z.string().uuid(),
	conversion_factor: z.number().positive().default(1.0),
	conversion_notes: z.string().nullable().optional(),
	is_default: z.boolean().default(false),
})

export type PurchaseItemWrite = z.infer<typeof PurchaseItemWriteSchema>
export type PurchaseItemIngredientWrite = z.infer<typeof PurchaseItemIngredientWriteSchema>
