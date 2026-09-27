/**
 * @module segments.fn
 * Segmentação das contratações da OM (change `sisub-procurement-planning-flows`, D3).
 * Wrappers finos das operações de `@iefa/sisub-domain` (operations/segments):
 * ler exige `unit:1` na OM; escrever, `unit:2`, com a OM lida do banco.
 * @domain core
 */

import {
	AddSegmentRuleSchema,
	addSegmentRule,
	CreateSegmentSchema,
	createSegment,
	DeleteSegmentSchema,
	deleteSegment,
	FetchSegmentationSchema,
	fetchSegmentationOverview,
	RemoveSegmentRuleSchema,
	removeSegmentRule,
	type SegmentationOverview,
	UpdateSegmentSchema,
	updateSegment,
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

export const createSegmentFn = createServerFn({ method: "POST" })
	.validator(CreateSegmentSchema)
	.handler(async ({ data }): Promise<{ id: string }> => {
		const ctx = await requireAuth()
		return createSegment(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateSegmentFn = createServerFn({ method: "POST" })
	.validator(UpdateSegmentSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return updateSegment(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteSegmentFn = createServerFn({ method: "POST" })
	.validator(DeleteSegmentSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return deleteSegment(getDb(), ctx, data).catch(handleDomainError)
	})

export const addSegmentRuleFn = createServerFn({ method: "POST" })
	.validator(AddSegmentRuleSchema)
	.handler(async ({ data }): Promise<{ id: string }> => {
		const ctx = await requireAuth()
		return addSegmentRule(getDb(), ctx, data).catch(handleDomainError)
	})

export const removeSegmentRuleFn = createServerFn({ method: "POST" })
	.validator(RemoveSegmentRuleSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return removeSegmentRule(getDb(), ctx, data).catch(handleDomainError)
	})
