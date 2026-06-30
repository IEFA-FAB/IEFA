/**
 * Recipe review operations: registro de conferência + leitura da última revisão.
 * Espelha ingredient-reviews.ts (mesma semântica, agregado preparação).
 *
 * `RecipeLastReview` projeta a view kitchen.recipe_last_review (DISTINCT ON por receita).
 */

import { recipeLastReviewInKitchen, recipeReviewInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { eq } from "drizzle-orm"
import { requireAnyPermission } from "../guards/require-permission.ts"
import type { VersionActor } from "../schemas/ingredients.ts"
import type { ListRecipeLastReviews, RecordRecipeReview } from "../schemas/recipes.ts"
import type { UserContext } from "../types/context.ts"
import { insertOneOrFail, runQuery } from "../utils/index.ts"

export interface RecipeReviewRow {
	id: string
	recipe_id: string
	reviewed_by: string | null
	reviewed_by_name: string | null
	note: string | null
	reviewed_at: string
}

/** Última revisão registrada para uma preparação (projeção da view kitchen.recipe_last_review). */
export interface RecipeLastReview {
	recipe_id: string
	reviewed_at: string
	reviewed_by: string | null
	reviewed_by_name: string | null
}

/**
 * Registra um evento de revisão (conferência) da preparação.
 * Cada chamada cria uma nova linha — o histórico de revisões é preservado.
 */
export async function recordRecipeReview(db: SisubDb, ctx: UserContext, input: RecordRecipeReview, actor?: VersionActor): Promise<RecipeReviewRow> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)

	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(recipeReviewInKitchen)
			.values({
				recipeId: input.recipeId,
				reviewedBy: actor?.id ?? ctx.userId ?? null,
				reviewedByName: actor?.name ?? null,
				note: input.note ?? null,
			})
			.returning()
	)
	return {
		id: row.id,
		recipe_id: row.recipeId,
		reviewed_by: row.reviewedBy,
		reviewed_by_name: row.reviewedByName,
		note: row.note,
		reviewed_at: row.reviewedAt,
	}
}

/**
 * Lê a última revisão por preparação.
 * Sem `recipeId` → todas as preparações revisadas.
 * Com `recipeId` → apenas a preparação informada (para a tela de detalhe).
 */
export async function listRecipeLastReviews(db: SisubDb, ctx: UserContext, input: ListRecipeLastReviews): Promise<RecipeLastReview[]> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)

	const where = input.recipeId ? eq(recipeLastReviewInKitchen.recipeId, input.recipeId) : undefined
	const rows = await runQuery("QUERY_FAILED", () =>
		db
			.select({
				recipe_id: recipeLastReviewInKitchen.recipeId,
				reviewed_at: recipeLastReviewInKitchen.reviewedAt,
				reviewed_by: recipeLastReviewInKitchen.reviewedBy,
				reviewed_by_name: recipeLastReviewInKitchen.reviewedByName,
			})
			.from(recipeLastReviewInKitchen)
			.where(where)
	)
	// A view garante recipe_id/reviewed_at não-nulos (DISTINCT ON sobre linhas reais).
	return rows as RecipeLastReview[]
}
