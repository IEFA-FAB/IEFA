/**
 * @module planning-bulk.fn
 * Edição em lote do calendário: repasse às operations de `@iefa/sisub-domain` (planning-bulk).
 */

import {
	ClearPlannedDaysSchema,
	clearPlannedDays,
	RefreshRecipeVersionsInDaysSchema,
	ReplaceRecipeInDaysSchema,
	refreshRecipeVersionsInDays,
	replaceRecipeInDays,
	ShiftPlannedDaysSchema,
	shiftPlannedDays,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const clearPlannedDaysFn = createServerFn({ method: "POST" }).validator(ClearPlannedDaysSchema).handler(requireAuthThenRun(clearPlannedDays))

export const shiftPlannedDaysFn = createServerFn({ method: "POST" }).validator(ShiftPlannedDaysSchema).handler(requireAuthThenRun(shiftPlannedDays))

export const replaceRecipeInDaysFn = createServerFn({ method: "POST" }).validator(ReplaceRecipeInDaysSchema).handler(requireAuthThenRun(replaceRecipeInDays))

export const refreshRecipeVersionsInDaysFn = createServerFn({ method: "POST" })
	.validator(RefreshRecipeVersionsInDaysSchema)
	.handler(requireAuthThenRun(refreshRecipeVersionsInDays))
