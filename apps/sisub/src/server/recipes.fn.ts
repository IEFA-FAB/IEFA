/**
 * @module recipes.fn
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 * Auth enforced via requireAuth() — all endpoints now require authentication.
 *
 * Bug fix: fetchRecipeFn now filters deleted_at IS NULL (via domain operation).
 * @domain core
 * @migration done
 */

import {
	CreateRecipeFolderSchema,
	CreateRecipeSchema,
	createRecipe,
	createRecipeFolder,
	DeleteRecipeFolderSchema,
	DeleteRecipeSchema,
	deleteRecipe,
	deleteRecipeFolder,
	FetchRecipeLineageHeadSchema,
	FetchRecipeSchema,
	fetchRecipe,
	fetchRecipeLineageHead,
	ListRecipeFoldersSchema,
	ListRecipeIngredientDigestsSchema,
	ListRecipeLastReviewsSchema,
	ListRecipesSchema,
	ListRecipeVersionsSchema,
	listRecipeFolders,
	listRecipeIngredientDigests,
	listRecipeLastReviews,
	listRecipeMenuUsage,
	listRecipeSummaries,
	listRecipeVersions,
	RecordRecipeReviewSchema,
	RenameRecipeFolderSchema,
	RenameRecipeSchema,
	RestoreRecipeSchema,
	recordRecipeReview,
	renameRecipe,
	renameRecipeFolder,
	restoreRecipe,
	SaveRecipeEditSchema,
	SetRecipeFolderSchema,
	saveRecipeEdit,
	setRecipeFolder,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { requireAuthThenRun } from "@/lib/domain-handler.server"
import { getSupabaseAuthClient } from "@/lib/supabase.server"

/** Identidade do autor da revisão (nome + id) a partir da sessão Supabase. */
async function resolveActor(): Promise<{ id: string | null; name: string | null }> {
	const {
		data: { user },
	} = await getSupabaseAuthClient().auth.getUser()
	if (!user) return { id: null, name: null }
	const meta = (user.user_metadata ?? {}) as Record<string, unknown>
	const name = (meta.full_name as string) ?? (meta.name as string) ?? (meta.display_name as string) ?? user.email ?? null
	return { id: user.id, name }
}

/**
 * Listagem de preparações SEM ficha técnica — o que toda tela de listagem consome.
 *
 * Substituiu `fetchRecipesFn` (`listRecipes`, com ingredientes aninhados): ~2.200 receitas
 * davam 14,5 MB por chamada e até 14 s, e em 2026-09-13 uma aba em loop de refetch em
 * `/global/recipes` levou as duas tasks a OutOfMemory com 13 s de diferença. A ficha técnica
 * sai por `fetchRecipeFn`, sob demanda (hovercard, fork em lote, snapshot do cardápio).
 */
export const fetchRecipeSummariesFn = createServerFn({ method: "GET" }).validator(ListRecipesSchema).handler(requireAuthThenRun(listRecipeSummaries))

export const fetchRecipeFn = createServerFn({ method: "GET" }).validator(FetchRecipeSchema).handler(requireAuthThenRun(fetchRecipe))

/** Versão vigente da linhagem no contexto da tela — o editor avisa quando a aberta foi superada. */
export const fetchRecipeLineageHeadFn = createServerFn({ method: "GET" })
	.validator(FetchRecipeLineageHeadSchema)
	.handler(requireAuthThenRun(fetchRecipeLineageHead))

/** Ingredientes (nome + alergênicos, sem quantidade) das fichas de um cardápio — impressão. */
export const fetchRecipeIngredientDigestsFn = createServerFn({ method: "GET" })
	.validator(ListRecipeIngredientDigestsSchema)
	.handler(requireAuthThenRun(listRecipeIngredientDigests))

// Alias kept for backward compat
export const fetchRecipeWithIngredientsFn = fetchRecipeFn

// IDs das preparações usadas em algum plano semanal (menu_template weekly não excluído).
export const fetchRecipeMenuUsageFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return listRecipeMenuUsage(getDb(), ctx).catch(handleDomainError)
})

export const fetchRecipeVersionsFn = createServerFn({ method: "GET" }).validator(ListRecipeVersionsSchema).handler(requireAuthThenRun(listRecipeVersions))

export const createRecipeFn = createServerFn({ method: "POST" }).validator(CreateRecipeSchema).handler(requireAuthThenRun(createRecipe))

export const saveRecipeEditFn = createServerFn({ method: "POST" }).validator(SaveRecipeEditSchema).handler(requireAuthThenRun(saveRecipeEdit))

export const deleteRecipeFn = createServerFn({ method: "POST" }).validator(DeleteRecipeSchema).handler(requireAuthThenRun(deleteRecipe))

export const restoreRecipeFn = createServerFn({ method: "POST" }).validator(RestoreRecipeSchema).handler(requireAuthThenRun(restoreRecipe))

export const renameRecipeFn = createServerFn({ method: "POST" }).validator(RenameRecipeSchema).handler(requireAuthThenRun(renameRecipe))

// ── Pastas de preparação (agrupamento plano — organização e filtragem) ───────

export const fetchRecipeFoldersFn = createServerFn({ method: "GET" }).validator(ListRecipeFoldersSchema).handler(requireAuthThenRun(listRecipeFolders))

export const createRecipeFolderFn = createServerFn({ method: "POST" }).validator(CreateRecipeFolderSchema).handler(requireAuthThenRun(createRecipeFolder))

export const renameRecipeFolderFn = createServerFn({ method: "POST" }).validator(RenameRecipeFolderSchema).handler(requireAuthThenRun(renameRecipeFolder))

export const deleteRecipeFolderFn = createServerFn({ method: "POST" }).validator(DeleteRecipeFolderSchema).handler(requireAuthThenRun(deleteRecipeFolder))

// Arquiva preparações numa pasta (folderId null = tira de qualquer pasta).
export const setRecipeFolderFn = createServerFn({ method: "POST" }).validator(SetRecipeFolderSchema).handler(requireAuthThenRun(setRecipeFolder))

// Registra um evento de revisão (conferência) da preparação pelos nutricionistas.
export const recordRecipeReviewFn = createServerFn({ method: "POST" })
	.validator(RecordRecipeReviewSchema)
	.handler(async ({ data }) => {
		const [ctx, actor] = await Promise.all([requireAuth(), resolveActor()])
		return recordRecipeReview(getDb(), ctx, data, actor).catch(handleDomainError)
	})

// Última revisão por preparação (sem recipeId → todas; com → detalhe).
export const fetchRecipeLastReviewsFn = createServerFn({ method: "GET" })
	.validator(ListRecipeLastReviewsSchema)
	.handler(requireAuthThenRun(listRecipeLastReviews))
