/**
 * @module execution-review.fn
 * Pendências que a execução do dia deixou para o planejamento (fluxo "Revisar a execução" da
 * Gestão Cozinha): inclusões do turno, fichas provisórias e incompletas, dias de saída
 * fechados sem justificativa e congeladas provisórias. Só leitura, mais a ação "revisar".
 * @domain kitchen
 * @migration 20260926217000_execution_never_blocks
 */

import { FetchExecutionReviewStatusSchema, fetchExecutionReviewStatus, ReviewExecutionMenuItemSchema, reviewExecutionMenuItem } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const fetchExecutionReviewStatusFn = createServerFn({ method: "GET" })
	.validator(FetchExecutionReviewStatusSchema)
	.handler(requireAuthThenRun(fetchExecutionReviewStatus))

/** A nutricionista marca como revisada a preparação que o turno incluiu no dia. */
export const reviewExecutionMenuItemFn = createServerFn({ method: "POST" })
	.validator(ReviewExecutionMenuItemSchema)
	.handler(requireAuthThenRun(reviewExecutionMenuItem))
