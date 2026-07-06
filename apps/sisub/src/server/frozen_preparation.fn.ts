/**
 * @module frozen_preparation.fn
 * CRUD para kitchen.frozen_preparation (preparações congeladas / semiacabados).
 * Thin wrappers delegando às operations de @iefa/sisub-domain.
 * Auth via requireAuth() — todos os endpoints exigem autenticação.
 * @domain kitchen
 * @migration done
 */

import {
	CreateFrozenPreparationSchema,
	createFrozenPreparation,
	DeleteFrozenPreparationSchema,
	deleteFrozenPreparation,
	FetchFrozenPreparationSchema,
	fetchFrozenPreparation,
	ListFrozenPreparationsSchema,
	listFrozenPreparations,
	UpdateFrozenPreparationSchema,
	updateFrozenPreparation,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

// ─── Fetch ────────────────────────────────────────────────────────────────────

export const listFrozenPreparationsFn = createServerFn({ method: "GET" })
	.validator(ListFrozenPreparationsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listFrozenPreparations(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchFrozenPreparationFn = createServerFn({ method: "GET" })
	.validator(FetchFrozenPreparationSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchFrozenPreparation(getDb(), ctx, data).catch(handleDomainError)
	})

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export const createFrozenPreparationFn = createServerFn({ method: "POST" })
	.validator(CreateFrozenPreparationSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createFrozenPreparation(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateFrozenPreparationFn = createServerFn({ method: "POST" })
	.validator(UpdateFrozenPreparationSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateFrozenPreparation(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteFrozenPreparationFn = createServerFn({ method: "POST" })
	.validator(DeleteFrozenPreparationSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteFrozenPreparation(getDb(), ctx, data).catch(handleDomainError)
	})
