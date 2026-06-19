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
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

// ─── Fetch ────────────────────────────────────────────────────────────────────

export const fetchPurchaseItemsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchPurchaseItemsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchPurchaseItems(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchIngredientPurchaseItemsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchIngredientPurchaseItemsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchIngredientPurchaseItems(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchPurchaseItemFn = createServerFn({ method: "GET" })
	.inputValidator(FetchPurchaseItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchPurchaseItem(getDb(), ctx, data).catch(handleDomainError)
	})

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export const createPurchaseItemFn = createServerFn({ method: "POST" })
	.inputValidator(CreatePurchaseItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createPurchaseItem(getDb(), ctx, data).catch(handleDomainError)
	})

export const updatePurchaseItemFn = createServerFn({ method: "POST" })
	.inputValidator(UpdatePurchaseItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updatePurchaseItem(getDb(), ctx, data).catch(handleDomainError)
	})

export const deletePurchaseItemFn = createServerFn({ method: "POST" })
	.inputValidator(DeletePurchaseItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deletePurchaseItem(getDb(), ctx, data).catch(handleDomainError)
	})

// ─── Junction: purchase_item_ingredient ──────────────────────────────────────

export const fetchPurchaseItemIngredientsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchPurchaseItemIngredientsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchPurchaseItemIngredients(getDb(), ctx, data).catch(handleDomainError)
	})

export const upsertPurchaseItemIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(UpsertPurchaseItemIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return upsertPurchaseItemIngredient(getDb(), ctx, data).catch(handleDomainError)
	})

export const deletePurchaseItemIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(DeletePurchaseItemIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deletePurchaseItemIngredient(getDb(), ctx, data).catch(handleDomainError)
	})

export const setDefaultPurchaseItemIngredientFn = createServerFn({ method: "POST" })
	.inputValidator(SetDefaultPurchaseItemIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return setDefaultPurchaseItemIngredient(getDb(), ctx, data).catch(handleDomainError)
	})
