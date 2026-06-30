import type { ReviewMetrics } from "@iefa/sisub-domain"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchReviewMetricsFn } from "@/server/review-metrics.fn"

/**
 * Métricas de progresso de revisão (insumos + preparações) para o painel lateral.
 * `from`/`to` são ISO datetimes; ausentes → últimos 6 meses (resolvido no servidor).
 */
export const reviewMetricsQueryOptions = (from?: string, to?: string) =>
	queryOptions({
		queryKey: queryKeys.reviewMetrics.summary(from, to),
		queryFn: () => fetchReviewMetricsFn({ data: { from, to } }) as Promise<ReviewMetrics>,
		staleTime: 5 * 60 * 1000,
		gcTime: 5 * 60 * 1000,
	})

export function useReviewMetrics(from?: string, to?: string, enabled = true) {
	return useQuery({ ...reviewMetricsQueryOptions(from, to), enabled })
}
