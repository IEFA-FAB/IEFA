/**
 * @module procurement-segments.fn
 * Segmentação das contratações da OM (change `sisub-procurement-planning-flows`, D3).
 * Wrappers finos das operações de `@iefa/sisub-domain` (operations/procurement-segments):
 * ler exige `unit:1` na OM; escrever, `unit:2`, com a OM lida do banco.
 * @domain core
 */

import {
	AddProcurementSegmentRuleSchema,
	addProcurementSegmentRule,
	CreateProcurementSegmentSchema,
	createProcurementSegment,
	DeleteProcurementSegmentSchema,
	deleteProcurementSegment,
	FetchSegmentationSchema,
	fetchSegmentationOverview,
	RemoveProcurementSegmentRuleSchema,
	removeProcurementSegmentRule,
	type SegmentationOverview,
	UpdateProcurementSegmentSchema,
	updateProcurementSegment,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchSegmentationOverviewFn = createServerFn({ method: "GET" })
	.validator(FetchSegmentationSchema)
	.handler(async ({ data }): Promise<SegmentationOverview> => {
		const ctx = await requireAuth()
		return fetchSegmentationOverview(getDb(), ctx, data).catch(handleDomainError)
	})

export const createProcurementSegmentFn = createServerFn({ method: "POST" })
	.validator(CreateProcurementSegmentSchema)
	.handler(async ({ data }): Promise<{ id: string }> => {
		const ctx = await requireAuth()
		return createProcurementSegment(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateProcurementSegmentFn = createServerFn({ method: "POST" })
	.validator(UpdateProcurementSegmentSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return updateProcurementSegment(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteProcurementSegmentFn = createServerFn({ method: "POST" })
	.validator(DeleteProcurementSegmentSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return deleteProcurementSegment(getDb(), ctx, data).catch(handleDomainError)
	})

export const addProcurementSegmentRuleFn = createServerFn({ method: "POST" })
	.validator(AddProcurementSegmentRuleSchema)
	.handler(async ({ data }): Promise<{ id: string }> => {
		const ctx = await requireAuth()
		return addProcurementSegmentRule(getDb(), ctx, data).catch(handleDomainError)
	})

export const removeProcurementSegmentRuleFn = createServerFn({ method: "POST" })
	.validator(RemoveProcurementSegmentRuleSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return removeProcurementSegmentRule(getDb(), ctx, data).catch(handleDomainError)
	})
