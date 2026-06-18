/**
 * @module purchase_item.fn
 * CRUD for purchase_item + purchase_item_ingredient junction.
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 * Auth enforced via requireAuth() — all endpoints now require authentication.
 * @domain core
 * @migration done
 */

import {
	CreatePurchaseItemSchema,
	createPurchaseItem,
	DeletePurchaseItemIngredientSchema,
	DeletePurchaseItemSchema,
	deletePurchaseItem,
	deletePurchaseItemIngredient,
	FetchIngredientPurchaseItemsSchema,
	FetchPurchaseItemIngredientsSchema,
	FetchPurchaseItemSchema,
	FetchPurchaseItemsSchema,
	fetchIngredientPurchaseItems,
	fetchPurchaseItem,
	fetchPurchaseItemIngredients,
	fetchPurchaseItems,
	SetDefaultPurchaseItemIngredientSchema,
	setDefaultPurchaseItemIngredient,
	UpdatePurchaseItemSchema,
	UpsertPurchaseItemIngredientSchema,
	updatePurchaseItem,
	upsertPurchaseItemIngredient,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"

// ─── Fetch ────────────────────────────────────────────────────────────────────

export const fetchPurchaseItemsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchPurchaseItemsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchPurchaseItems(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const fetchIngredientPurchaseItemsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchIngredientPurchaseItemsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchIngredientPurchaseItems(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const fetchPurchaseItemFn = createServerFn({ method: "GET" })
	.inputValidator(FetchPurchaseItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchPurchaseItem(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export const createPurchaseItemFn = createServerFn({ method: "POST" })
	.inputValidator(CreatePurchaseItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createPurchaseItem(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const updatePurchaseItemFn = createServerFn({ method: "POST" })
	.inputValidator(UpdatePurchaseItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updatePurchaseItem(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const deletePurchaseItemFn = createServerFn({ method: "POST" })
	.inputValidator(DeletePurchaseItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deletePurchaseItem(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// ─── Junction: purchase_item_ingredient ──────────────────────────────────────

export const fetchPurchaseItemIngredientsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchPurchaseItemIngredientsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchPurchaseItemIngredients(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const upsertPurchaseItemIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(UpsertPurchaseItemIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return upsertPurchaseItemIngredient(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const deletePurchaseItemIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(DeletePurchaseItemIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deletePurchaseItemIngredient(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const setDefaultPurchaseItemIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(SetDefaultPurchaseItemIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return setDefaultPurchaseItemIngredient(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})
