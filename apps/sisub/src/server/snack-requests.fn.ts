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
import { requireAuthThenRun } from "@/lib/domain-handler.server"

// ─── Padrões (Gestão Cozinha / catálogo) ─────────────────────────────────────

export const setSnackClassificationFn = createServerFn({ method: "POST" })
	.validator(SetSnackClassificationSchema)
	.handler(requireAuthThenRun(setSnackClassification))

export const fetchSnackStandardEnergyFn = createServerFn({ method: "GET" })
	.validator(GetSnackStandardEnergySchema)
	.handler(requireAuthThenRun(getSnackStandardEnergy))

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
	.handler(requireAuthThenRun(listOrderableStandards))

export const createSnackRequestFn = createServerFn({ method: "POST" }).validator(CreateSnackRequestSchema).handler(requireAuthThenRun(createSnackRequest))

export const fetchMySnackRequestsFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return listMySnackRequests(getDb(), ctx).catch(handleDomainError)
})

export const fetchMySnackRequestFn = createServerFn({ method: "GET" }).validator(SnackRequestIdSchema).handler(requireAuthThenRun(getMySnackRequest))

export const cancelMySnackRequestFn = createServerFn({ method: "POST" }).validator(CancelMySnackRequestSchema).handler(requireAuthThenRun(cancelMySnackRequest))

// ─── Gestão Cozinha ──────────────────────────────────────────────────────────

export const fetchKitchenSnackRequestsFn = createServerFn({ method: "GET" })
	.validator(ListKitchenSnackRequestsSchema)
	.handler(requireAuthThenRun(listKitchenSnackRequests))

export const fetchKitchenSnackRequestFn = createServerFn({ method: "GET" }).validator(SnackRequestIdSchema).handler(requireAuthThenRun(getKitchenSnackRequest))

export const fetchSnackLabelDataFn = createServerFn({ method: "GET" }).validator(SnackRequestIdSchema).handler(requireAuthThenRun(getSnackLabelData))

export const fetchSnackProductionSummaryFn = createServerFn({ method: "GET" })
	.validator(SnackProductionSummarySchema)
	.handler(requireAuthThenRun(fetchSnackProductionSummary))

export const decideSnackRequestFn = createServerFn({ method: "POST" }).validator(DecideSnackRequestSchema).handler(requireAuthThenRun(decideSnackRequest))

export const advanceSnackRequestFn = createServerFn({ method: "POST" }).validator(AdvanceSnackRequestSchema).handler(requireAuthThenRun(advanceSnackRequest))

export const registerSnackPickupFn = createServerFn({ method: "POST" }).validator(RegisterSnackPickupSchema).handler(requireAuthThenRun(registerSnackPickup))

export const registerSnackMaterialReturnFn = createServerFn({ method: "POST" })
	.validator(RegisterSnackMaterialReturnSchema)
	.handler(requireAuthThenRun(registerSnackMaterialReturn))

export const closeSnackRequestFn = createServerFn({ method: "POST" }).validator(SnackRequestIdSchema).handler(requireAuthThenRun(closeSnackRequest))

export const cancelKitchenSnackRequestFn = createServerFn({ method: "POST" })
	.validator(KitchenCancelSnackRequestSchema)
	.handler(requireAuthThenRun(cancelKitchenSnackRequest))
