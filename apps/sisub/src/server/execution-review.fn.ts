/**
 * @module execution-review.fn
 * Pendências que a execução do dia deixou para o planejamento (fluxo "Revisar a execução" da
 * Gestão Cozinha): inclusões do turno, fichas provisórias e incompletas, dias de saída
 * fechados sem justificativa e congeladas provisórias. Só leitura, mais a ação "revisar".
 * @domain kitchen
 * @migration 20260926217000_execution_never_blocks
 */

import {
	type ExecutionReviewStatus,
	FetchExecutionReviewStatusSchema,
	fetchExecutionReviewStatus,
	ReviewExecutionMenuItemSchema,
	reviewExecutionMenuItem,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const fetchExecutionReviewStatusFn = createServerFn({ method: "GET" })
	.validator(FetchExecutionReviewStatusSchema)
	.handler(async ({ data }): Promise<ExecutionReviewStatus> => {
		const ctx = await requireAuth()
		return fetchExecutionReviewStatus(getDb(), ctx, data).catch(handleDomainError)
	})

/** A nutricionista marca como revisada a preparação que o turno incluiu no dia. */
export const reviewExecutionMenuItemFn = createServerFn({ method: "POST" })
	.validator(ReviewExecutionMenuItemSchema)
	.handler(requireAuthThenRun(reviewExecutionMenuItem))
