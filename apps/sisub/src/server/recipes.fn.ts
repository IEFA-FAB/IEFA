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
	CreateRecipeSchema,
	CreateRecipeVersionSchema,
	createRecipe,
	createRecipeVersion,
	DeleteRecipeSchema,
	deleteRecipe,
	FetchRecipeSchema,
	fetchRecipe,
	ListRecipesSchema,
	ListRecipeVersionsSchema,
	listRecipeMenuUsage,
	listRecipes,
	listRecipeVersions,
	RenameRecipeSchema,
	RestoreRecipeSchema,
	renameRecipe,
	restoreRecipe,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"

export const fetchRecipesFn = createServerFn({ method: "GET" })
	.inputValidator(ListRecipesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listRecipes(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const fetchRecipeFn = createServerFn({ method: "GET" })
	.inputValidator(FetchRecipeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchRecipe(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// Alias kept for backward compat
export const fetchRecipeWithIngredientsFn = fetchRecipeFn

// IDs das preparações usadas em algum plano semanal (menu_template weekly não excluído).
export const fetchRecipeMenuUsageFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return listRecipeMenuUsage(getSupabaseServerClient(), ctx).catch(handleDomainError)
})

export const fetchRecipeVersionsFn = createServerFn({ method: "GET" })
	.inputValidator(ListRecipeVersionsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listRecipeVersions(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const createRecipeFn = createServerFn({ method: "POST" })
	.inputValidator(CreateRecipeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createRecipe(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const createRecipeVersionFn = createServerFn({ method: "POST" })
	.inputValidator(CreateRecipeVersionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createRecipeVersion(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const deleteRecipeFn = createServerFn({ method: "POST" })
	.inputValidator(DeleteRecipeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteRecipe(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const restoreRecipeFn = createServerFn({ method: "POST" })
	.inputValidator(RestoreRecipeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return restoreRecipe(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const renameRecipeFn = createServerFn({ method: "POST" })
	.inputValidator(RenameRecipeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return renameRecipe(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})
