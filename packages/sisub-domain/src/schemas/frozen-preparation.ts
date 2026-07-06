import { z } from "zod"
import { UuidSchema } from "./common.ts"

export const FrozenPreparationCategorySchema = z.enum(["preparacao", "prato_pronto", "lanche_pronto"])
export type FrozenPreparationCategory = z.infer<typeof FrozenPreparationCategorySchema>

/** Payload de escrita (snake_case, contrato de linha). source_ingredient_id/legacy_id são geridos pela migração, não pelo UI. */
export const FrozenPreparationWriteSchema = z.object({
	description: z.string().min(1, "Descrição obrigatória"),
	measure_unit: z.string().nullable().optional(),
	yield_quantity: z.number().positive().nullable().optional(),
	correction_factor: z.number().positive().nullable().optional(),
	density_factor: z.number().positive().nullable().optional(),
	category: FrozenPreparationCategorySchema.default("preparacao"),
	production_recipe_id: UuidSchema.nullable().optional(),
	regeneration_recipe_id: UuidSchema.nullable().optional(),
	shelf_life_days: z.number().int().positive().nullable().optional(),
	storage_temperature_c: z.number().nullable().optional(),
	storage_instructions: z.string().nullable().optional(),
	ceafa_id: UuidSchema.nullable().optional(),
})
export type FrozenPreparationWrite = z.infer<typeof FrozenPreparationWriteSchema>

export const ListFrozenPreparationsSchema = z.object({
	search: z.string().optional(),
	category: FrozenPreparationCategorySchema.optional(),
})
export type ListFrozenPreparations = z.infer<typeof ListFrozenPreparationsSchema>

export const FetchFrozenPreparationSchema = z.object({ id: UuidSchema })
export type FetchFrozenPreparation = z.infer<typeof FetchFrozenPreparationSchema>

export const CreateFrozenPreparationSchema = z.object({ payload: FrozenPreparationWriteSchema })
export type CreateFrozenPreparation = z.infer<typeof CreateFrozenPreparationSchema>

export const UpdateFrozenPreparationSchema = z.object({ id: UuidSchema, payload: FrozenPreparationWriteSchema.partial() })
export type UpdateFrozenPreparation = z.infer<typeof UpdateFrozenPreparationSchema>

export const DeleteFrozenPreparationSchema = z.object({ id: UuidSchema })
export type DeleteFrozenPreparation = z.infer<typeof DeleteFrozenPreparationSchema>
