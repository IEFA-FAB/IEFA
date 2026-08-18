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
	/**
	 * Recorte do lado INSUMO das métricas — as três abas de /global/ingredients, que são
	 * três catálogos disjuntos dentro de `kitchen.ingredient`. Omitido ⇒ `insumos`.
	 *
	 * Sem o recorte havia um denominador só para os três: a cobertura da aba aberta era
	 * calculada sobre 1.893 linhas das quais 168 são EPI e material de limpeza, que
	 * nutricionista nenhum confere. O percentual respondia a uma pergunta que ninguém fez.
	 * O lado PREPARAÇÃO (kitchen.recipes) não é afetado.
	 */
	ingredientScope: z.enum(["insumos", "preparacoes", "auxiliares"]).optional(),
})
export type GetReviewMetrics = z.infer<typeof GetReviewMetricsSchema>
