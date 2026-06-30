/**
 * @module review-metrics.fn
 * Métricas de progresso de revisão (insumos + preparações) para o painel lateral.
 * Thin wrapper delegando a @iefa/sisub-domain.
 * @domain core
 */

import { GetReviewMetricsSchema, getReviewMetrics } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchReviewMetricsFn = createServerFn({ method: "GET" })
	.validator(GetReviewMetricsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getReviewMetrics(getDb(), ctx, data).catch(handleDomainError)
	})
