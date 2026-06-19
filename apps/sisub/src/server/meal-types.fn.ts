/**
 * @module meal-types.fn
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 * Auth enforced via requireAuth() — all endpoints now require authentication.
 * @domain core
 * @migration done
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
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchMealTypesFn = createServerFn({ method: "GET" })
	.inputValidator(FetchMealTypesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchMealTypes(getDb(), ctx, data).catch(handleDomainError)
	})

export const createMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(CreateMealTypeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createMealType(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateMealTypeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateMealType(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(DeleteMealTypeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteMealType(getDb(), ctx, data).catch(handleDomainError)
	})

export const restoreMealTypeFn = createServerFn({ method: "POST" })
	.inputValidator(RestoreMealTypeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return restoreMealType(getDb(), ctx, data).catch(handleDomainError)
	})
