import type { ReviewMetrics } from "@iefa/sisub-domain"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchReviewMetricsFn } from "@/server/review-metrics.fn"

/** Recorte do lado insumo — as três abas de /global/ingredients. Ver `review-metrics.ts`. */
export type ReviewMetricsIngredientScope = "insumos" | "preparacoes" | "auxiliares"

/**
 * Métricas de progresso de revisão (insumos + preparações) para o painel lateral.
 * `from`/`to` são ISO datetimes; ausentes → últimos 6 meses (resolvido no servidor).
 *
 * `ingredientScope` entra na CHAVE da query: as três abas têm denominadores diferentes, e
 * sem ela abrir o painel numa aba serviria o número em cache da outra.
 */
export const reviewMetricsQueryOptions = (from?: string, to?: string, ingredientScope: ReviewMetricsIngredientScope = "insumos") =>
	queryOptions({
		queryKey: queryKeys.reviewMetrics.summary(from, to, ingredientScope),
		queryFn: () => fetchReviewMetricsFn({ data: { from, to, ingredientScope } }) as Promise<ReviewMetrics>,
		staleTime: 5 * 60 * 1000,
		gcTime: 5 * 60 * 1000,
	})

export function useReviewMetrics(from?: string, to?: string, enabled = true, ingredientScope: ReviewMetricsIngredientScope = "insumos") {
	return useQuery({ ...reviewMetricsQueryOptions(from, to, ingredientScope), enabled })
}
