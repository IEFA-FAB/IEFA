import { z } from "zod"

/**
 * Janela temporal das métricas de revisão. `from`/`to` são ISO datetimes.
 * Ausentes → a operação assume os últimos 6 meses (default).
 * A janela governa o feed de atividade diária e o "revisados no período";
 * a cobertura geral (revisados alguma vez / ativos) é independente da janela.
 */
export const GetReviewMetricsSchema = z.object({
	from: z.string().datetime().optional(),
	to: z.string().datetime().optional(),
})
export type GetReviewMetrics = z.infer<typeof GetReviewMetricsSchema>
