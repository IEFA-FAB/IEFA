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
	ingredientIdOfPurchaseLink,
	ingredientIdsOfPurchaseItem,
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
import { withIngredientVersions } from "./ingredient-versioning.server"

// ─── Fetch ────────────────────────────────────────────────────────────────────

export const fetchPurchaseItemsFn = createServerFn({ method: "GET" })
	.validator(FetchPurchaseItemsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchPurchaseItems(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchIngredientPurchaseItemsFn = createServerFn({ method: "GET" })
	.validator(FetchIngredientPurchaseItemsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchIngredientPurchaseItems(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchPurchaseItemFn = createServerFn({ method: "GET" })
	.validator(FetchPurchaseItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchPurchaseItem(getDb(), ctx, data).catch(handleDomainError)
	})

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export const createPurchaseItemFn = createServerFn({ method: "POST" })
	.validator(CreatePurchaseItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createPurchaseItem(getDb(), ctx, data).catch(handleDomainError)
	})

export const updatePurchaseItemFn = createServerFn({ method: "POST" })
	.validator(UpdatePurchaseItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		// Item de compra é catálogo compartilhado (N:N): editar muda a versão de TODO insumo vinculado.
		return withIngredientVersions(ctx, async (db, touch) => {
			touch(...(await ingredientIdsOfPurchaseItem(db, data.id)))
			return updatePurchaseItem(db, ctx, data)
		}).catch(handleDomainError)
	})

export const deletePurchaseItemFn = createServerFn({ method: "POST" })
	.validator(DeletePurchaseItemSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withIngredientVersions(ctx, async (db, touch) => {
			touch(...(await ingredientIdsOfPurchaseItem(db, data.id)))
			return deletePurchaseItem(db, ctx, data)
		}).catch(handleDomainError)
	})

// ─── Junction: purchase_item_ingredient ──────────────────────────────────────

export const fetchPurchaseItemIngredientsFn = createServerFn({ method: "GET" })
	.validator(FetchPurchaseItemIngredientsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchPurchaseItemIngredients(getDb(), ctx, data).catch(handleDomainError)
	})

export const upsertPurchaseItemIngredientFn = createServerFn({ method: "POST" })
	.validator(UpsertPurchaseItemIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withIngredientVersions(ctx, (db, touch) => {
			touch(data.payload.ingredient_id)
			return upsertPurchaseItemIngredient(db, ctx, data)
		}).catch(handleDomainError)
	})

export const deletePurchaseItemIngredientFn = createServerFn({ method: "POST" })
	.validator(DeletePurchaseItemIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		// Lido ANTES: depois do delete a linha que diz de qual insumo era o vínculo não existe mais.
		return withIngredientVersions(ctx, async (db, touch) => {
			touch(await ingredientIdOfPurchaseLink(db, data.id))
			return deletePurchaseItemIngredient(db, ctx, data)
		}).catch(handleDomainError)
	})

export const setDefaultPurchaseItemIngredientFn = createServerFn({ method: "POST" })
	.validator(SetDefaultPurchaseItemIngredientSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withIngredientVersions(ctx, async (db, touch) => {
			touch(await ingredientIdOfPurchaseLink(db, data.id))
			return setDefaultPurchaseItemIngredient(db, ctx, data)
		}).catch(handleDomainError)
	})
