import { z } from "zod"

/**
 * Execução do dia (Produção Cozinha): o turno inclui preparação no cardápio de HOJE, inclusive
 * uma que não está no catálogo (provisória, só com o nome). Ver `operations/execution.ts`.
 */

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")

export const EXECUTION_REASON_MAX = 200

export const AddExecutionMenuItemSchema = z
	.object({
		kitchenId: z.number().int().positive(),
		/** Tem de ser hoje (Brasília). Vem da tela para a recusa dizer qual dia estava aberto. */
		serviceDate: IsoDate,
		mealTypeId: z.uuid(),
		/** Preparação do catálogo (global ou da cozinha). */
		recipeId: z.uuid().optional(),
		/** Preparação que não existe no catálogo: nasce provisória, da cozinha, só com o nome. */
		provisionalRecipeName: z.string().trim().min(3, "Nome com ao menos 3 letras").max(120).optional(),
		plannedPortionQuantity: z.number().positive().max(100_000).optional(),
		reason: z.string().trim().min(3, "Diga em poucas palavras por que entrou").max(EXECUTION_REASON_MAX),
	})
	.refine((input) => (input.recipeId == null) !== (input.provisionalRecipeName == null), {
		message: "Escolha uma preparação do catálogo ou informe o nome de uma nova — uma das duas",
		path: ["recipeId"],
	})
export type AddExecutionMenuItem = z.infer<typeof AddExecutionMenuItemSchema>

export const FetchExecutionOptionsSchema = z.object({ kitchenId: z.number().int().positive() })
export type FetchExecutionOptions = z.infer<typeof FetchExecutionOptionsSchema>

export const ReviewExecutionMenuItemSchema = z.object({ menuItemId: z.uuid() })
export type ReviewExecutionMenuItem = z.infer<typeof ReviewExecutionMenuItemSchema>

export const FetchExecutionReviewStatusSchema = z.object({ kitchenId: z.number().int().positive() })
export type FetchExecutionReviewStatus = z.infer<typeof FetchExecutionReviewStatusSchema>

export const ReviewProvisionalFrozenPreparationSchema = z.object({ id: z.uuid() })
export type ReviewProvisionalFrozenPreparation = z.infer<typeof ReviewProvisionalFrozenPreparationSchema>
