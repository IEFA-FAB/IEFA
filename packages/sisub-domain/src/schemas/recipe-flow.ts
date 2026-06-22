/**
 * Schemas do Fluxo de Produção estruturado (DAG do modo de preparo).
 *
 * O grafo é editado no cliente (xyflow) e persistido inteiro via `saveRecipeFlow`
 * (replace transacional). Cada nó tem um `clientId` (id do xyflow); as edges
 * referenciam a saída de origem por `sourceOutputClientId`. O domínio remapeia
 * `clientId` → uuid no insert. Inputs são polimórficos: insumo cru
 * (`recipeIngredientId`) XOR saída de etapa anterior (`sourceOutputClientId`).
 */

import { z } from "zod"
import { KitchenIdSchema, UuidSchema } from "./common.ts"

/** Saída (produto intermediário) de uma etapa. `clientId` é o id local do xyflow. */
export const StepOutputSchema = z.object({
	clientId: z.string().min(1),
	label: z.string().nullable().optional(),
	quantity: z.number().nonnegative().nullable().optional(),
	measureUnit: z.string().nullable().optional(),
	isFinal: z.boolean(),
})
export type StepOutput = z.infer<typeof StepOutputSchema>

/** Input de uma etapa: insumo cru XOR saída de outra etapa (validado por `.refine`). */
export const StepInputSchema = z
	.object({
		recipeIngredientId: UuidSchema.nullable().optional(),
		sourceOutputClientId: z.string().nullable().optional(),
		quantity: z.number().nonnegative().nullable().optional(),
		measureUnit: z.string().nullable().optional(),
	})
	.refine((v) => (v.recipeIngredientId != null) !== (v.sourceOutputClientId != null), {
		message: "input precisa de exatamente uma fonte (recipeIngredientId XOR sourceOutputClientId)",
	})
export type StepInput = z.infer<typeof StepInputSchema>

export const StepSchema = z.object({
	clientId: z.string().min(1),
	stepTemplateId: UuidSchema.nullable().optional(),
	label: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	durationMinutes: z.number().int().nonnegative().nullable().optional(),
	canvasX: z.number(),
	canvasY: z.number(),
	utensilIds: z.array(UuidSchema).default([]),
	outputs: z.array(StepOutputSchema).default([]),
	inputs: z.array(StepInputSchema).default([]),
})
export type Step = z.infer<typeof StepSchema>

export const SaveRecipeFlowSchema = z.object({
	recipeId: UuidSchema,
	steps: z.array(StepSchema),
})
export type SaveRecipeFlow = z.infer<typeof SaveRecipeFlowSchema>

export const FetchRecipeFlowSchema = z.object({ recipeId: UuidSchema })
export type FetchRecipeFlow = z.infer<typeof FetchRecipeFlowSchema>

// ── Catálogo ──────────────────────────────────────────────────────────────

export const ListStepTemplatesSchema = z.object({
	kitchenId: KitchenIdSchema.nullable().optional(),
	search: z.string().max(200).optional(),
})
export type ListStepTemplates = z.infer<typeof ListStepTemplatesSchema>

export const CreateStepTemplateSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().nullable().optional(),
	defaultDurationMinutes: z.number().int().nonnegative().nullable().optional(),
	kitchenId: KitchenIdSchema.nullable().optional(),
	/** Utensílios padrão sugeridos ao inserir a etapa numa receita. */
	utensilIds: z.array(UuidSchema).default([]),
})
export type CreateStepTemplate = z.infer<typeof CreateStepTemplateSchema>

export const ListUtensilsSchema = z.object({
	kitchenId: KitchenIdSchema.nullable().optional(),
	search: z.string().max(200).optional(),
})
export type ListUtensils = z.infer<typeof ListUtensilsSchema>

export const CreateUtensilSchema = z.object({
	name: z.string().min(1).max(200),
	kitchenId: KitchenIdSchema.nullable().optional(),
})
export type CreateUtensil = z.infer<typeof CreateUtensilSchema>
