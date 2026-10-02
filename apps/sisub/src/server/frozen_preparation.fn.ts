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
	listPendingProvisionalFrozenPreparations,
	ReviewProvisionalFrozenPreparationSchema,
	reviewProvisionalFrozenPreparation,
	UpdateFrozenPreparationSchema,
	updateFrozenPreparation,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

// ─── Fetch ────────────────────────────────────────────────────────────────────

export const listFrozenPreparationsFn = createServerFn({ method: "GET" })
	.validator(ListFrozenPreparationsSchema)
	.handler(requireAuthThenRun(listFrozenPreparations))

export const fetchFrozenPreparationFn = createServerFn({ method: "GET" })
	.validator(FetchFrozenPreparationSchema)
	.handler(requireAuthThenRun(fetchFrozenPreparation))

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export const createFrozenPreparationFn = createServerFn({ method: "POST" })
	.validator(CreateFrozenPreparationSchema)
	.handler(requireAuthThenRun(createFrozenPreparation))

export const updateFrozenPreparationFn = createServerFn({ method: "POST" })
	.validator(UpdateFrozenPreparationSchema)
	.handler(requireAuthThenRun(updateFrozenPreparation))

export const deleteFrozenPreparationFn = createServerFn({ method: "POST" })
	.validator(DeleteFrozenPreparationSchema)
	.handler(requireAuthThenRun(deleteFrozenPreparation))

// ─── Congelada provisória (sobra registrada pela cozinha sem cadastro) ────────

/** Congeladas que as cozinhas criaram para registrar sobra, esperando a revisão da SDAB. */
export const listPendingProvisionalFrozenPreparationsFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return listPendingProvisionalFrozenPreparations(getDb(), ctx).catch(handleDomainError)
})

/** A SDAB aceita a congelada provisória no catálogo global. */
export const reviewProvisionalFrozenPreparationFn = createServerFn({ method: "POST" })
	.validator(ReviewProvisionalFrozenPreparationSchema)
	.handler(requireAuthThenRun(reviewProvisionalFrozenPreparation))
