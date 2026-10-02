/**
 * @module production.fn
 * Kitchen production board: production_task lifecycle management.
 * Thin wrappers over @iefa/sisub-domain (operations/production).
 * State machine: PENDING → IN_PROGRESS (sets started_at) → DONE (sets completed_at) → PENDING (clears both timestamps).
 * @domain core
 * @migration done
 */

import {
	AddExecutionMenuItemSchema,
	AdjustProductionPortionsSchema,
	addExecutionMenuItem,
	adjustProductionPortions,
	EnsureProductionTasksSchema,
	ensureProductionTasks,
	FetchExecutionOptionsSchema,
	FetchProductionBoardSchema,
	fetchExecutionOptions,
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
import { requireAuthThenRun } from "@/lib/domain-handler.server"
import type { ProductionItem, ProductionTask } from "@/types/domain/production"

export const fetchProductionBoardFn = createServerFn({ method: "GET" })
	.validator(FetchProductionBoardSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return (await fetchProductionBoard(getDb(), ctx, data).catch(handleDomainError)) as unknown as ProductionItem[]
	})

export const ensureProductionTasksFn = createServerFn({ method: "POST" })
	.validator(EnsureProductionTasksSchema)
	.handler(requireAuthThenRun(ensureProductionTasks))

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
	.handler(requireAuthThenRun(adjustProductionPortions))

export const recordProductionSubstitutionFn = createServerFn({ method: "POST" })
	.validator(RecordProductionSubstitutionSchema)
	.handler(requireAuthThenRun(recordProductionSubstitution))

/**
 * Opções do "Incluir preparação" do turno: refeições e preparações do catálogo. Leitura própria
 * da execução — o turno em geral não tem `kitchen:1`, que é o que o catálogo do planejamento exige.
 */
export const fetchExecutionOptionsFn = createServerFn({ method: "GET" })
	.validator(FetchExecutionOptionsSchema)
	.handler(requireAuthThenRun(fetchExecutionOptions))

/** O turno inclui uma preparação no cardápio de HOJE (inclusive uma provisória, só com o nome). */
export const addExecutionMenuItemFn = createServerFn({ method: "POST" }).validator(AddExecutionMenuItemSchema).handler(requireAuthThenRun(addExecutionMenuItem))
