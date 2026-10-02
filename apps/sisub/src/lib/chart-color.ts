/**
 * @module chart-color
 * Cor de série dos gráficos do assistente de analytics.
 *
 * A cor vem do modelo (`render_chart.series[].color`) e ia crua para `fill`/`stroke` do
 * Recharts. Um modelo sob prompt injection escreve `url(https://x/?d=…)` (busca sozinha ao
 * desenhar), `url(#id)` apontando para outro elemento da página, ou só texto que quebra o
 * gráfico. Passa só `#hex` (3, 6 ou 8 dígitos) e `var(--chart-N)` do tema; o resto cai na
 * paleta. Vale no servidor (o que a tool devolve e o histórico grava) e na tela (o histórico
 * gravado antes desta regra).
 * @domain app
 */

/** Paleta de séries — tokens de chart calibrados do tema (styles.css). O 6º slot usa --governance (roxo calibrado). */
export const CHART_PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-5)", "var(--governance)", "var(--chart-4)"] as const

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const THEME_CHART_VAR_RE = /^var\(--chart-[1-9]\)$/

/** A cor, se for uma das formas aceitas; senão `undefined`. */
export function safeChartColor(color: unknown): string | undefined {
	if (typeof color !== "string") return undefined
	const trimmed = color.trim()
	return HEX_COLOR_RE.test(trimmed) || THEME_CHART_VAR_RE.test(trimmed) ? trimmed : undefined
}

/** Cor da série `index`: a pedida, se aceita; senão a da paleta naquela posição. */
export function seriesColor(color: unknown, index: number): string {
	return safeChartColor(color) ?? CHART_PALETTE[index % CHART_PALETTE.length]
}
