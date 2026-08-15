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
	FetchRecipeSchema,
	fetchRecipe,
	ListRecipeFoldersSchema,
	ListRecipeLastReviewsSchema,
	ListRecipesSchema,
	ListRecipeVersionsSchema,
	listRecipeFolders,
	listRecipeLastReviews,
	listRecipeMenuUsage,
	listRecipes,
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

export const fetchRecipesFn = createServerFn({ method: "GET" })
	.validator(ListRecipesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listRecipes(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchRecipeFn = createServerFn({ method: "GET" })
	.validator(FetchRecipeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchRecipe(getDb(), ctx, data).catch(handleDomainError)
	})

// Alias kept for backward compat
export const fetchRecipeWithIngredientsFn = fetchRecipeFn

// IDs das preparações usadas em algum plano semanal (menu_template weekly não excluído).
export const fetchRecipeMenuUsageFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return listRecipeMenuUsage(getDb(), ctx).catch(handleDomainError)
})

export const fetchRecipeVersionsFn = createServerFn({ method: "GET" })
	.validator(ListRecipeVersionsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listRecipeVersions(getDb(), ctx, data).catch(handleDomainError)
	})

export const createRecipeFn = createServerFn({ method: "POST" })
	.validator(CreateRecipeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createRecipe(getDb(), ctx, data).catch(handleDomainError)
	})

export const saveRecipeEditFn = createServerFn({ method: "POST" })
	.validator(SaveRecipeEditSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return saveRecipeEdit(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteRecipeFn = createServerFn({ method: "POST" })
	.validator(DeleteRecipeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteRecipe(getDb(), ctx, data).catch(handleDomainError)
	})

export const restoreRecipeFn = createServerFn({ method: "POST" })
	.validator(RestoreRecipeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return restoreRecipe(getDb(), ctx, data).catch(handleDomainError)
	})

export const renameRecipeFn = createServerFn({ method: "POST" })
	.validator(RenameRecipeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return renameRecipe(getDb(), ctx, data).catch(handleDomainError)
	})

// ── Pastas de preparação (agrupamento plano — organização e filtragem) ───────

export const fetchRecipeFoldersFn = createServerFn({ method: "GET" })
	.validator(ListRecipeFoldersSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listRecipeFolders(getDb(), ctx, data).catch(handleDomainError)
	})

export const createRecipeFolderFn = createServerFn({ method: "POST" })
	.validator(CreateRecipeFolderSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createRecipeFolder(getDb(), ctx, data).catch(handleDomainError)
	})

export const renameRecipeFolderFn = createServerFn({ method: "POST" })
	.validator(RenameRecipeFolderSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return renameRecipeFolder(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteRecipeFolderFn = createServerFn({ method: "POST" })
	.validator(DeleteRecipeFolderSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteRecipeFolder(getDb(), ctx, data).catch(handleDomainError)
	})

// Arquiva preparações numa pasta (folderId null = tira de qualquer pasta).
export const setRecipeFolderFn = createServerFn({ method: "POST" })
	.validator(SetRecipeFolderSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return setRecipeFolder(getDb(), ctx, data).catch(handleDomainError)
	})

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
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listRecipeLastReviews(getDb(), ctx, data).catch(handleDomainError)
	})
