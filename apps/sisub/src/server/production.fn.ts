/**
 * @module production.fn
 * Kitchen production board: production_task lifecycle management.
 * Thin wrappers over @iefa/sisub-domain (operations/production).
 * State machine: PENDING → IN_PROGRESS (sets started_at) → DONE (sets completed_at) → PENDING (clears both timestamps).
 * @domain core
 * @migration done
 */

import {
	AdjustProductionPortionsSchema,
	adjustProductionPortions,
	EnsureProductionTasksSchema,
	ensureProductionTasks,
	FetchProductionBoardSchema,
	fetchProductionBoard,
	RecordProductionSubstitutionSchema,
	recordProductionSubstitution,
	UpdateProductionTaskRecordSchema,
	UpdateProductionTaskStatusSchema,
	updateProductionTaskRecord,
	updateProductionTaskStatus,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import type { ProductionItem, ProductionTask } from "@/types/domain/production"

export const fetchProductionBoardFn = createServerFn({ method: "GET" })
	.validator(FetchProductionBoardSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return (await fetchProductionBoard(getDb(), ctx, data).catch(handleDomainError)) as unknown as ProductionItem[]
	})

export const ensureProductionTasksFn = createServerFn({ method: "POST" })
	.validator(EnsureProductionTasksSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return ensureProductionTasks(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateProductionTaskStatusFn = createServerFn({ method: "POST" })
	.validator(UpdateProductionTaskStatusSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return (await updateProductionTaskStatus(getDb(), ctx, data).catch(handleDomainError)) as unknown as ProductionTask
	})

export const updateProductionTaskRecordFn = createServerFn({ method: "POST" })
	.validator(UpdateProductionTaskRecordSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return (await updateProductionTaskRecord(getDb(), ctx, data).catch(handleDomainError)) as unknown as ProductionTask
	})

export const adjustProductionPortionsFn = createServerFn({ method: "POST" })
	.validator(AdjustProductionPortionsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return adjustProductionPortions(getDb(), ctx, data).catch(handleDomainError)
	})

export const recordProductionSubstitutionFn = createServerFn({ method: "POST" })
	.validator(RecordProductionSubstitutionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return recordProductionSubstitution(getDb(), ctx, data).catch(handleDomainError)
	})
