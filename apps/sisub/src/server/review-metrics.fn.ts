/**
 * @module review-metrics.fn
 * Métricas de progresso de revisão (insumos + preparações) para o painel lateral.
 * Thin wrapper delegando a @iefa/sisub-domain.
 * @domain core
 */

import { GetReviewMetricsSchema, getReviewMetrics } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const fetchReviewMetricsFn = createServerFn({ method: "GET" }).validator(GetReviewMetricsSchema).handler(requireAuthThenRun(getReviewMetrics))
