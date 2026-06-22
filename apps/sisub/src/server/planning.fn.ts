/**
 * @module planning.fn
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 * Auth enforced via requireAuth() — all endpoints now require authentication.
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
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchDailyMenusFn = createServerFn({ method: "GET" })
	.validator(DailyMenuFetchSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchDailyMenus(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchDayDetailsFn = createServerFn({ method: "GET" })
	.validator(DayDetailsFetchSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchDayDetails(getDb(), ctx, data).catch(handleDomainError)
	})

export const upsertDailyMenuFn = createServerFn({ method: "POST" })
	.validator(UpsertDailyMenuSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return upsertDailyMenu(getDb(), ctx, data).catch(handleDomainError)
	})

export const addMenuItemFn = createServerFn({ method: "POST" })
	.validator(AddMenuItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return addMenuItem(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateMenuItemFn = createServerFn({ method: "POST" })
	.validator(UpdateMenuItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateMenuItem(getDb(), ctx, data).catch(handleDomainError)
	})

export const removeMenuItemFn = createServerFn({ method: "POST" })
	.validator(RemoveMenuItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return removeMenuItem(getDb(), ctx, data).catch(handleDomainError)
	})

// Legacy alias kept for backward compat
export const softDeleteMenuItemFn = removeMenuItemFn

export const restoreMenuItemFn = createServerFn({ method: "POST" })
	.validator(RestoreMenuItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return restoreMenuItem(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateHeadcountFn = createServerFn({ method: "POST" })
	.validator(UpdateHeadcountSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateHeadcount(getDb(), ctx, data).catch(handleDomainError)
	})

// Legacy alias kept for backward compat
export const updateDailyMenuFn = updateHeadcountFn

export const updateSubstitutionsFn = createServerFn({ method: "POST" })
	.validator(UpdateSubstitutionsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateSubstitutions(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchTrashItemsFn = createServerFn({ method: "GET" })
	.validator(GetTrashItemsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getTrashItems(getDb(), ctx, data).catch(handleDomainError)
	})
