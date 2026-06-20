/**
 * Ingredient review operations: registro de conferência + leitura da última revisão.
 * Drizzle query layer (migração PostgREST→Drizzle).
 *
 * `IngredientLastReview` projeta a view sisub.ingredient_last_review (DISTINCT ON por insumo).
 */

import { ingredientLastReviewInSisub, ingredientReviewInSisub, type SisubDb } from "@iefa/database/drizzle/sisub"
import { eq } from "drizzle-orm"
import { requirePermission } from "../guards/require-permission.ts"
import type { ListIngredientLastReviews, RecordIngredientReview, VersionActor } from "../schemas/ingredients.ts"
import type { UserContext } from "../types/context.ts"
import { insertOneOrFail, runQuery } from "../utils/index.ts"

export interface IngredientReviewRow {
	id: string
	ingredient_id: string
	reviewed_by: string | null
	reviewed_by_name: string | null
	note: string | null
	reviewed_at: string
}

/** Última revisão registrada para um insumo (projeção da view sisub.ingredient_last_review). */
export interface IngredientLastReview {
	ingredient_id: string
	reviewed_at: string
	reviewed_by: string | null
	reviewed_by_name: string | null
}

/**
 * Registra um evento de revisão (conferência) do insumo.
 * Cada chamada cria uma nova linha — o histórico de revisões é preservado.
 */
export async function recordIngredientReview(db: SisubDb, ctx: UserContext, input: RecordIngredientReview, actor?: VersionActor): Promise<IngredientReviewRow> {
	requirePermission(ctx, "kitchen", 1)

	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(ingredientReviewInSisub)
			.values({
				ingredientId: input.ingredientId,
				reviewedBy: actor?.id ?? ctx.userId ?? null,
				reviewedByName: actor?.name ?? null,
				note: input.note ?? null,
			})
			.returning()
	)
	return {
		id: row.id,
		ingredient_id: row.ingredientId,
		reviewed_by: row.reviewedBy,
		reviewed_by_name: row.reviewedByName,
		note: row.note,
		reviewed_at: row.reviewedAt,
	}
}

/**
 * Lê a última revisão por insumo.
 * Sem `ingredientId` → todos os insumos revisados (para a árvore de insumos).
 * Com `ingredientId` → apenas o insumo informado (para a tela de detalhe).
 */
export async function listIngredientLastReviews(db: SisubDb, ctx: UserContext, input: ListIngredientLastReviews): Promise<IngredientLastReview[]> {
	requirePermission(ctx, "kitchen", 1)

	const where = input.ingredientId ? eq(ingredientLastReviewInSisub.ingredientId, input.ingredientId) : undefined
	const rows = await runQuery("QUERY_FAILED", () =>
		db
			.select({
				ingredient_id: ingredientLastReviewInSisub.ingredientId,
				reviewed_at: ingredientLastReviewInSisub.reviewedAt,
				reviewed_by: ingredientLastReviewInSisub.reviewedBy,
				reviewed_by_name: ingredientLastReviewInSisub.reviewedByName,
			})
			.from(ingredientLastReviewInSisub)
			.where(where)
	)
	// A view garante ingredient_id/reviewed_at não-nulos (DISTINCT ON sobre linhas reais).
	return rows as IngredientLastReview[]
}
