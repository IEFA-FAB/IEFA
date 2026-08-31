/**
 * @module auditor/theme
 * Cromo dos gráficos do auditor e rampa do ICC.
 *
 * O recharts pinta em atributo SVG (`stroke`, `fill`), não em classe, então ele
 * não enxerga `dark:`. Antes disso o módulo resolvia cada cor com
 * `isDarkMode ? "#334155" : "#e2e8f0"` — 226 ocorrências de uma prop atravessando
 * oito componentes só para escolher entre dois hex.
 *
 * A saída é `var(--token)`: atributo de apresentação SVG resolve custom property,
 * e a folha já redefine os tokens sob `.dark`. Quem troca de tema passa a ser o
 * CSS, e o componente deixa de saber que existe tema.
 */

/** Cromo: eixo, grade, superfície. Papel semântico, não cor. */
export const chartChrome = {
	/** Linhas da grade e bordas de célula. */
	grid: "var(--color-border)",
	/** Rótulos de eixo e legenda. */
	axis: "var(--color-muted-foreground)",
	/** Fundo de rótulo desenhado sobre o gráfico. */
	surface: "var(--color-card)",
	/** Superfície rebaixada: cursor do tooltip, faixa alternada. */
	surfaceMuted: "var(--color-muted)",
	/** Texto sobre `surface`. */
	label: "var(--color-foreground)",
} as const

/** Séries do confronto, nomeadas pelo dado que carregam. */
export const chartSeries = {
	siafi: "var(--color-series-siafi)",
	siloms: "var(--color-series-siloms)",
	diff: "var(--color-series-diff)",
	pareto: "var(--color-series-pareto)",
	accumulated: "var(--color-series-accum)",
	/** Eixo secundário do gráfico de Pareto. */
	axisAlt: "var(--color-series-axis-alt)",
} as const

/**
 * Rampa do Índice de Conformidade Contábil.
 *
 * Cinco degraus e não três: `success`/`warning`/`destructive` classificam um
 * estado, e o ICC é uma medida contínua que a seção lê como faixa. É escala
 * sequencial de visualização, então os valores são explícitos de propósito — mas
 * declarados uma vez, e não recalculados dentro de cada componente.
 *
 * A mesma rampa serve fundo claro e escuro: são cores saturadas, legíveis nos dois.
 */
export const ICC_RAMP = [
	{ min: 98, color: "#10b981", label: "Excelência Máxima" },
	{ min: 90, color: "#22c55e", label: "Nível Excelente" },
	{ min: 80, color: "#f59e0b", label: "Nível Operacional" },
	{ min: 70, color: "#f97316", label: "Divergência Moderada" },
	{ min: Number.NEGATIVE_INFINITY, color: "#ef4444", label: "Necessita Saneamento" },
] as const

const iccStep = (value: number) => ICC_RAMP.find((step) => value >= step.min) ?? ICC_RAMP[ICC_RAMP.length - 1]

export const iccColor = (value: number): string => iccStep(value).color
export const iccLabel = (value: number): string => iccStep(value).label
