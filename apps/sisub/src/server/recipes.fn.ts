/**
 * @module recipes.fn
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 * Auth enforced via requireAuth() — all endpoints now require authentication.
 *
 * Bug fix: fetchRecipeFn now filters deleted_at IS NULL (via domain operation).
 */

import {
	CreateRecipeSchema,
	CreateRecipeVersionSchema,
	createRecipe,
	createRecipeVersion,
	FetchRecipeSchema,
	fetchRecipe,
	ListRecipesSchema,
	ListRecipeVersionsSchema,
	listRecipes,
	listRecipeVersions,
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
