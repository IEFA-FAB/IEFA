/**
 * @module snack-requests.fn
 * Pedido de Lanche de Bordo/Apoio (Módulo 7 do Manual SISUB): padrões pedíveis, requisição do
 * comensal e o ciclo na Gestão Cozinha (aceite → produção → retirada → devolução).
 * Thin wrappers delegating to @iefa/sisub-domain operations (operations/snack-requests).
 * Auth enforced via requireAuth(); o nível de cada operação é aplicado na operation, com a
 * cozinha lida da linha do pedido.
 * @domain kitchen
 * @migration done
 */

import {
	AdvanceSnackRequestSchema,
	advanceSnackRequest,
	CancelMySnackRequestSchema,
	CreateSnackRequestSchema,
	cancelKitchenSnackRequest,
	cancelMySnackRequest,
	closeSnackRequest,
	createSnackRequest,
	DecideSnackRequestSchema,
	decideSnackRequest,
	fetchSnackMealType,
	fetchSnackProductionSummary,
	GetSnackStandardEnergySchema,
	getKitchenSnackRequest,
	getMySnackRequest,
	getSnackLabelData,
	getSnackOrderingContext,
	getSnackStandardEnergy,
	KitchenCancelSnackRequestSchema,
	ListKitchenSnackRequestsSchema,
	ListOrderableStandardsSchema,
	listKitchenSnackRequests,
	listMySnackRequests,
	listOrderableStandards,
	RegisterSnackMaterialReturnSchema,
	RegisterSnackPickupSchema,
	registerSnackMaterialReturn,
	registerSnackPickup,
	SetSnackClassificationSchema,
	SnackProductionSummarySchema,
	SnackRequestIdSchema,
	setSnackClassification,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

// ─── Padrões (Gestão Cozinha / catálogo) ─────────────────────────────────────

export const setSnackClassificationFn = createServerFn({ method: "POST" })
	.validator(SetSnackClassificationSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return setSnackClassification(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchSnackStandardEnergyFn = createServerFn({ method: "GET" })
	.validator(GetSnackStandardEnergySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getSnackStandardEnergy(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchSnackMealTypeFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return fetchSnackMealType(getDb(), ctx).catch(handleDomainError)
})

// ─── Comensal ────────────────────────────────────────────────────────────────

export const fetchSnackOrderingContextFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return getSnackOrderingContext(getDb(), ctx).catch(handleDomainError)
})

export const fetchOrderableSnackStandardsFn = createServerFn({ method: "GET" })
	.validator(ListOrderableStandardsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listOrderableStandards(getDb(), ctx, data).catch(handleDomainError)
	})

export const createSnackRequestFn = createServerFn({ method: "POST" })
	.validator(CreateSnackRequestSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createSnackRequest(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchMySnackRequestsFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return listMySnackRequests(getDb(), ctx).catch(handleDomainError)
})

export const fetchMySnackRequestFn = createServerFn({ method: "GET" })
	.validator(SnackRequestIdSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getMySnackRequest(getDb(), ctx, data).catch(handleDomainError)
	})

export const cancelMySnackRequestFn = createServerFn({ method: "POST" })
	.validator(CancelMySnackRequestSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return cancelMySnackRequest(getDb(), ctx, data).catch(handleDomainError)
	})

// ─── Gestão Cozinha ──────────────────────────────────────────────────────────

export const fetchKitchenSnackRequestsFn = createServerFn({ method: "GET" })
	.validator(ListKitchenSnackRequestsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listKitchenSnackRequests(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchKitchenSnackRequestFn = createServerFn({ method: "GET" })
	.validator(SnackRequestIdSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getKitchenSnackRequest(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchSnackLabelDataFn = createServerFn({ method: "GET" })
	.validator(SnackRequestIdSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getSnackLabelData(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchSnackProductionSummaryFn = createServerFn({ method: "GET" })
	.validator(SnackProductionSummarySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchSnackProductionSummary(getDb(), ctx, data).catch(handleDomainError)
	})

export const decideSnackRequestFn = createServerFn({ method: "POST" })
	.validator(DecideSnackRequestSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return decideSnackRequest(getDb(), ctx, data).catch(handleDomainError)
	})

export const advanceSnackRequestFn = createServerFn({ method: "POST" })
	.validator(AdvanceSnackRequestSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return advanceSnackRequest(getDb(), ctx, data).catch(handleDomainError)
	})

export const registerSnackPickupFn = createServerFn({ method: "POST" })
	.validator(RegisterSnackPickupSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return registerSnackPickup(getDb(), ctx, data).catch(handleDomainError)
	})

export const registerSnackMaterialReturnFn = createServerFn({ method: "POST" })
	.validator(RegisterSnackMaterialReturnSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return registerSnackMaterialReturn(getDb(), ctx, data).catch(handleDomainError)
	})

export const closeSnackRequestFn = createServerFn({ method: "POST" })
	.validator(SnackRequestIdSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return closeSnackRequest(getDb(), ctx, data).catch(handleDomainError)
	})

export const cancelKitchenSnackRequestFn = createServerFn({ method: "POST" })
	.validator(KitchenCancelSnackRequestSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return cancelKitchenSnackRequest(getDb(), ctx, data).catch(handleDomainError)
	})
