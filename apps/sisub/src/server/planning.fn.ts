/**
 * @module planning.fn
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 * Auth enforced via requireAuthThenRun() — all endpoints now require authentication.
 * @domain core
 * @migration done
 */

import {
	AddMenuItemSchema,
	addMenuItem,
	DailyMenuFetchSchema,
	DayDetailsFetchSchema,
	fetchDailyMenus,
	fetchDayDetails,
	GetTrashItemsSchema,
	getTrashItems,
	RemoveMenuItemSchema,
	RestoreMenuItemSchema,
	removeMenuItem,
	restoreMenuItem,
	UpdateHeadcountSchema,
	UpdateMenuItemSchema,
	UpdateSubstitutionsSchema,
	UpsertDailyMenuSchema,
	updateHeadcount,
	updateMenuItem,
	updateSubstitutions,
	upsertDailyMenu,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const fetchDailyMenusFn = createServerFn({ method: "GET" }).validator(DailyMenuFetchSchema).handler(requireAuthThenRun(fetchDailyMenus))

export const fetchDayDetailsFn = createServerFn({ method: "GET" }).validator(DayDetailsFetchSchema).handler(requireAuthThenRun(fetchDayDetails))

export const upsertDailyMenuFn = createServerFn({ method: "POST" }).validator(UpsertDailyMenuSchema).handler(requireAuthThenRun(upsertDailyMenu))

export const addMenuItemFn = createServerFn({ method: "POST" }).validator(AddMenuItemSchema).handler(requireAuthThenRun(addMenuItem))

export const updateMenuItemFn = createServerFn({ method: "POST" }).validator(UpdateMenuItemSchema).handler(requireAuthThenRun(updateMenuItem))

export const removeMenuItemFn = createServerFn({ method: "POST" }).validator(RemoveMenuItemSchema).handler(requireAuthThenRun(removeMenuItem))

// Legacy alias kept for backward compat
export const softDeleteMenuItemFn = removeMenuItemFn

export const restoreMenuItemFn = createServerFn({ method: "POST" }).validator(RestoreMenuItemSchema).handler(requireAuthThenRun(restoreMenuItem))

export const updateHeadcountFn = createServerFn({ method: "POST" }).validator(UpdateHeadcountSchema).handler(requireAuthThenRun(updateHeadcount))

// Legacy alias kept for backward compat
export const updateDailyMenuFn = updateHeadcountFn

export const updateSubstitutionsFn = createServerFn({ method: "POST" }).validator(UpdateSubstitutionsSchema).handler(requireAuthThenRun(updateSubstitutions))

export const fetchTrashItemsFn = createServerFn({ method: "GET" }).validator(GetTrashItemsSchema).handler(requireAuthThenRun(getTrashItems))
