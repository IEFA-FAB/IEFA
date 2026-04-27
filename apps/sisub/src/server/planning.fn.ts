/**
 * @module planning.fn
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 * Auth enforced via requireAuth() — all endpoints now require authentication.
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
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"

export const fetchDailyMenusFn = createServerFn({ method: "GET" })
	.inputValidator(DailyMenuFetchSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchDailyMenus(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const fetchDayDetailsFn = createServerFn({ method: "GET" })
	.inputValidator(DayDetailsFetchSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchDayDetails(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const upsertDailyMenuFn = createServerFn({ method: "POST" })
	.inputValidator(UpsertDailyMenuSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return upsertDailyMenu(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const addMenuItemFn = createServerFn({ method: "POST" })
	.inputValidator(AddMenuItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return addMenuItem(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const updateMenuItemFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateMenuItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateMenuItem(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const removeMenuItemFn = createServerFn({ method: "POST" })
	.inputValidator(RemoveMenuItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return removeMenuItem(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// Legacy alias kept for backward compat
export const softDeleteMenuItemFn = removeMenuItemFn

export const restoreMenuItemFn = createServerFn({ method: "POST" })
	.inputValidator(RestoreMenuItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return restoreMenuItem(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const updateHeadcountFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateHeadcountSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateHeadcount(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// Legacy alias kept for backward compat
export const updateDailyMenuFn = updateHeadcountFn

export const updateSubstitutionsFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateSubstitutionsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateSubstitutions(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const fetchTrashItemsFn = createServerFn({ method: "GET" })
	.inputValidator(GetTrashItemsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getTrashItems(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})
