import type { SupabaseClient } from "@supabase/supabase-js"
import { requirePermission } from "../guards/require-permission.ts"
import type { ListIngredientLastReviews, RecordIngredientReview, VersionActor } from "../schemas/ingredients.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client (ingredient_review fora dos tipos gerados)
type AnyClient = SupabaseClient<any, any, any>

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
export async function recordIngredientReview(
	client: AnyClient,
	ctx: UserContext,
	input: RecordIngredientReview,
	actor?: VersionActor
): Promise<IngredientReviewRow> {
	requirePermission(ctx, "kitchen", 1)

	const { data, error } = await client
		.from("ingredient_review")
		.insert({
			ingredient_id: input.ingredientId,
			reviewed_by: actor?.id ?? ctx.userId ?? null,
			reviewed_by_name: actor?.name ?? null,
			note: input.note ?? null,
		})
		.select()
		.single()
	if (error) throw new DomainError("INSERT_FAILED", error.message)
	return data as IngredientReviewRow
}

/**
 * Lê a última revisão por insumo.
 * Sem `ingredientId` → todos os insumos revisados (para a árvore de insumos).
 * Com `ingredientId` → apenas o insumo informado (para a tela de detalhe).
 */
export async function listIngredientLastReviews(client: AnyClient, ctx: UserContext, input: ListIngredientLastReviews): Promise<IngredientLastReview[]> {
	requirePermission(ctx, "kitchen", 1)

	let query = client.from("ingredient_last_review").select("ingredient_id, reviewed_at, reviewed_by, reviewed_by_name")
	if (input.ingredientId) query = query.eq("ingredient_id", input.ingredientId)

	const { data, error } = await query
	if (error) throw new DomainError("QUERY_FAILED", error.message)
	return (data ?? []) as IngredientLastReview[]
}
