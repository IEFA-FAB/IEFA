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
 *
 * Os nomes são os das variáveis BASE (`--card`, `--foreground`, `--series-*`), e
 * NÃO os utilitários `--color-*` do `@theme inline`. A diferença não é cosmética:
 * o Tailwind emite `--color-card: var(--card)` no `:root`, e uma custom property
 * é computada no elemento em que é declarada — então `--color-card` congela o
 * valor do tema claro e todo descendente herda esse valor já resolvido, inclusive
 * dentro de `.dark`. Usar `--color-*` aqui deixava o gráfico inteiro preso no
 * tema claro: no escuro, o rótulo de valor saía branco sobre branco.
 */

import { RiskLevel } from "./types"

/** Cromo: eixo, grade, superfície. Papel semântico, não cor. */
export const chartChrome = {
	/** Linhas da grade e bordas de célula. */
	grid: "var(--border)",
	/** Rótulos de eixo e legenda. */
	axis: "var(--muted-foreground)",
	/** Fundo de rótulo desenhado sobre o gráfico. */
	surface: "var(--card)",
	/** Superfície rebaixada: cursor do tooltip, faixa alternada. */
	surfaceMuted: "var(--muted)",
	/** Texto sobre `surface`. */
	label: "var(--foreground)",
} as const

/** Séries do confronto, nomeadas pelo dado que carregam. */
export const chartSeries = {
	siafi: "var(--series-siafi)",
	siloms: "var(--series-siloms)",
	diff: "var(--series-diff)",
	pareto: "var(--series-pareto)",
	accumulated: "var(--series-accum)",
	/** Eixo secundário do gráfico de Pareto. */
	axisAlt: "var(--series-axis-alt)",
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

/**
 * Rampa de risco: quatro faixas, quatro cores.
 *
 * Pelo mesmo motivo do ICC, não cabe em `success`/`warning`/`destructive`: são
 * quatro degraus de uma escala, e colapsar dois deles no mesmo token faz a legenda
 * afirmar que Médio e Alto são a mesma coisa. Mesma paleta do `ICC_RAMP`, para que
 * as duas leituras da mesma tela não briguem.
 */
export const RISK_RAMP: Record<RiskLevel, string> = {
	[RiskLevel.BAIXO]: "#10b981",
	[RiskLevel.MEDIO]: "#f59e0b",
	[RiskLevel.ALTO]: "#f97316",
	[RiskLevel.CRITICO]: "#ef4444",
}

export const riskColor = (level: RiskLevel): string => RISK_RAMP[level]
