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
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const fetchMealTypesFn = createServerFn({ method: "GET" }).validator(FetchMealTypesSchema).handler(requireAuthThenRun(fetchMealTypes))

export const createMealTypeFn = createServerFn({ method: "POST" }).validator(CreateMealTypeSchema).handler(requireAuthThenRun(createMealType))

export const updateMealTypeFn = createServerFn({ method: "POST" }).validator(UpdateMealTypeSchema).handler(requireAuthThenRun(updateMealType))

export const deleteMealTypeFn = createServerFn({ method: "POST" }).validator(DeleteMealTypeSchema).handler(requireAuthThenRun(deleteMealType))

export const restoreMealTypeFn = createServerFn({ method: "POST" }).validator(RestoreMealTypeSchema).handler(requireAuthThenRun(restoreMealType))
