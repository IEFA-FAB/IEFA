/**
 * @module meal-types.fn
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 * Auth enforced via requireAuth() — all endpoints now require authentication.
 */

import {
	CreateMealTypeSchema,
	createMealType,
	DeleteMealTypeSchema,
	deleteMealType,
	FetchMealTypesSchema,
	fetchMealTypes,
	RestoreMealTypeSchema,
	restoreMealType,
	UpdateMealTypeSchema,
	updateMealType,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"

export const fetchMealTypesFn = createServerFn({ method: "GET" })
	.inputValidator(FetchMealTypesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchMealTypes(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const createMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(CreateMealTypeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createMealType(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const updateMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateMealTypeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateMealType(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const deleteMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(DeleteMealTypeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteMealType(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const restoreMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(RestoreMealTypeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return restoreMealType(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})
