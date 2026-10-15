// Extraído de auditor/components/Charts.tsx (port do VMOBILE-AUDITOR-SUCONT-4 / SIAFI-x-SILOMS-Auditor):
// agregações e derivações puras dos gráficos de Comparação e Evolução.

import type { CSSProperties } from "react"
import type { FinancialRecord, TimeFilter } from "../types"
import { AccountGroup, type RiskLevel } from "../types"
import { toShortDate } from "./dataProcessor"
import { computeNetDifference } from "./net-difference"

export type HierarchyLevel = "ODS" | "ORGAO" | "UG"

export type AggregatedItem = {
	name: string
	ug: string
	siafi: number
	siloms: number
	diff: number
	orgaoSuperior: string
	ods: string
	riskLevel?: RiskLevel
	bmpDiff: number
	consumoDiff: number
	intangivelDiff: number
	accumulatedPct?: number
}

function resolveAggregationKey(curr: FinancialRecord, isSpecificUnitSelected: boolean, hierarchyLevel: HierarchyLevel) {
	let key = curr.ug

	if (isSpecificUnitSelected || hierarchyLevel === "UG") key = curr.ug
	else if (hierarchyLevel === "ODS") key = curr.ods
	else if (hierarchyLevel === "ORGAO") key = curr.orgaoSuperior

	return key
}

function addRecordToItem(found: AggregatedItem, curr: FinancialRecord) {
	found.siafi += curr.siafiValue || 0
	found.siloms += curr.silomsValue || 0
	found.diff += curr.difference || 0

	if (curr.group === AccountGroup.BMP) found.bmpDiff += curr.difference || 0
	if (curr.group === AccountGroup.CONSUMO) found.consumoDiff += curr.difference || 0
	if (curr.group === AccountGroup.INTANGIVEL) found.intangivelDiff += curr.difference || 0
}

function createAggregatedItem(key: string, curr: FinancialRecord): AggregatedItem {
	return {
		name: key,
		ug: curr.ug,
		siafi: curr.siafiValue || 0,
		siloms: curr.silomsValue || 0,
		diff: curr.difference || 0,
		orgaoSuperior: curr.orgaoSuperior,
		ods: curr.ods,
		riskLevel: curr.riskLevel,
		bmpDiff: curr.group === AccountGroup.BMP ? curr.difference || 0 : 0,
		consumoDiff: curr.group === AccountGroup.CONSUMO ? curr.difference || 0 : 0,
		intangivelDiff: curr.group === AccountGroup.INTANGIVEL ? curr.difference || 0 : 0,
	}
}

/** Memo `{ aggregated, paretoData, totalAbsDiff }` do `ComparisonChart`. */
export function aggregateComparisonData(data: FinancialRecord[], hierarchyFilter: string[], hierarchyLevel: HierarchyLevel) {
	if (!data) return { aggregated: [], paretoData: [], totalAbsDiff: 0 }

	// Invariante por chamada: era recalculado a cada registro dentro do reduce.
	const isSpecificUnitSelected = hierarchyFilter && hierarchyFilter.length === 1 && hierarchyFilter[0] !== "TODOS"

	// Map por chave: o `acc.find` linear fazia O(registros × chaves) a cada troca de filtro.
	// A ordem de inserção do Map é a mesma do array que ele substitui.
	const byKey = new Map<string, AggregatedItem>()
	for (const curr of data) {
		const key = resolveAggregationKey(curr, isSpecificUnitSelected, hierarchyLevel)
		const found = byKey.get(key)
		if (found) addRecordToItem(found, curr)
		else byKey.set(key, createAggregatedItem(key, curr))
	}
	const agg = [...byKey.values()].filter((item) => item.diff > 0)

	agg.sort((a, b) => b.diff - a.diff)

	const total = agg.reduce((sum, item) => sum + item.diff, 0)
	let acc2 = 0
	const pareto = agg.map((item) => {
		acc2 += item.diff
		return {
			...item,
			totalAbsDiffContext: total,
			accumulatedPct: total > 0 ? (acc2 / total) * 100 : 0,
		}
	})

	return { aggregated: agg, paretoData: pareto, totalAbsDiff: total }
}

/**
 * Diferença líquida do conjunto (SIAFI − SILOMS, ver `net-difference.ts`), derivada das
 * colunas somadas em vez de acumulada em paralelo.
 */
export const computeTotalNetDifference = (items: Pick<AggregatedItem, "siafi" | "siloms">[]): number =>
	computeNetDifference(
		items.reduce((sum, item) => sum + item.siafi, 0),
		items.reduce((sum, item) => sum + item.siloms, 0)
	)

export type EvolutionViewMode = "total" | "overlap" | "icc" | "comparison"

export type TimeSeriesItem = {
	date: string
	year: number
	monthIndex: number
	totalDiff: number
	totalSiafi: number
	totalSiloms: number
	timestamp: number
	axisLabel: string
	icc?: number
	diffHighlight?: number
	prevYearDiff?: number
	prevYearLabel?: string
	currentYearLabel?: string
}

/**
 * Soma por competência. Saldo ausente conta 0 como em `aggregateComparisonData`; na
 * produção `safeNum`/`normalizeData` já zeram antes, isto só mantém os agregadores coerentes.
 */
function groupTimeSeriesByDate(data: FinancialRecord[]) {
	const byDate = new Map<string, TimeSeriesItem>()
	for (const curr of data) {
		const found = byDate.get(curr.date)
		if (found) {
			found.totalDiff += curr.difference || 0
			found.totalSiafi += curr.siafiValue || 0
			found.totalSiloms += curr.silomsValue || 0
		} else {
			byDate.set(curr.date, {
				date: curr.date,
				year: curr.year,
				monthIndex: curr.monthIndex,
				totalDiff: curr.difference || 0,
				totalSiafi: curr.siafiValue || 0,
				totalSiloms: curr.silomsValue || 0,
				timestamp: curr.year * 100 + curr.monthIndex,
				axisLabel: toShortDate(curr.date),
			})
		}
	}
	return [...byDate.values()]
}

/** Mantém só as competências a um múltiplo do passo do escopo, contadas para trás da âncora. */
function filterByScopeGap(sorted: TimeSeriesItem[], timeFilter: TimeFilter, selectedMonth: string | undefined) {
	let gap = 1
	if (timeFilter === "TRIMESTRAL") gap = 3
	if (timeFilter === "SEMESTRAL") gap = 6
	if (timeFilter === "ANUAL") gap = 12

	let anchorIndex = sorted.length - 1
	if (selectedMonth && selectedMonth !== "TODOS") {
		const foundIndex = sorted.findIndex((s) => s.date === selectedMonth)
		if (foundIndex >= 0) anchorIndex = foundIndex
	}

	const anchorItem = sorted[anchorIndex]
	const anchorTotalMonths = anchorItem.year * 12 + anchorItem.monthIndex

	return sorted.filter((item) => {
		const itemTotalMonths = item.year * 12 + item.monthIndex
		const diffMonths = anchorTotalMonths - itemTotalMonths
		return diffMonths >= 0 && diffMonths % gap === 0
	})
}

function enrichTimeSeriesItem(item: TimeSeriesItem, sorted: TimeSeriesItem[]) {
	const icc = item.totalSiafi > 0 ? Math.max(0, (1 - item.totalDiff / item.totalSiafi) * 100) : item.totalDiff === 0 ? 100 : 0

	const prevYear = item.year - 1
	const prevMonth = item.monthIndex
	const prevYearItem = sorted.find((s) => s.year === prevYear && s.monthIndex === prevMonth)

	return {
		...item,
		icc: Math.max(0, Math.min(100, icc)),
		diffHighlight: Math.abs(item.totalSiafi - item.totalSiloms),
		prevYearDiff: prevYearItem ? prevYearItem.totalDiff : 0,
		prevYearLabel: prevYearItem ? toShortDate(prevYearItem.date) : "N/A",
		currentYearLabel: toShortDate(item.date),
	}
}

/** Memo `timeSeries` do `EvolutionChart`. */
export function buildTimeSeries(data: FinancialRecord[], timeFilter: TimeFilter, viewMode: EvolutionViewMode, selectedMonth: string | undefined) {
	if (!data) return [] as TimeSeriesItem[]
	const grouped = groupTimeSeriesByDate(data)

	const sorted = grouped.sort((a, b) => a.timestamp - b.timestamp)

	let filteredSorted = sorted
	if (timeFilter !== "MENSAL" && sorted.length > 0 && viewMode !== "comparison") {
		filteredSorted = filterByScopeGap(sorted, timeFilter, selectedMonth)
	}

	return filteredSorted.map((item) => enrichTimeSeriesItem(item, sorted))
}

export interface TooltipDataPayload {
	diff?: number
	totalDiff?: number
	difference?: number
	siafi?: number
	totalSiafi?: number
	siafiValue?: number
	siloms?: number
	totalSiloms?: number
	silomsValue?: number
	accumulatedPct?: number
	icc?: number
	name?: string
	ug?: string
	bmpDiff?: number
	consumoDiff?: number
	intangivelDiff?: number
}

/** Valores que o `CustomDetailedTooltip` lê do ponto, qualquer que seja o gráfico de origem. */
export function resolveTooltipValues(data: TooltipDataPayload, label: string | undefined) {
	const diff = data.diff !== undefined ? data.diff : data.totalDiff !== undefined ? data.totalDiff : data.difference
	const siafi = data.siafi !== undefined ? data.siafi : data.totalSiafi !== undefined ? data.totalSiafi : data.siafiValue
	const siloms = data.siloms !== undefined ? data.siloms : data.totalSiloms !== undefined ? data.totalSiloms : data.silomsValue
	const pct = data.accumulatedPct
	const icc = data.icc

	const siafiNum = siafi ?? 0
	const silomsNum = siloms ?? 0
	const absDiff = Math.abs(siafiNum - silomsNum)
	const pctDiff = siafiNum > 0 ? (absDiff / siafiNum) * 100 : 0

	const displayName = data.name && data.name !== "N/A" ? data.name : data.ug && data.ug !== "N/A" ? data.ug : label

	return { diff, siafi, siloms, pct, icc, pctDiff, displayName }
}

export type ComparisonViewMode = "composition" | "ranking" | "tree"

/**
 * Opacidade da barra por posição na curva de Pareto: cheia até 80% do acumulado,
 * apagada depois. Era um `<Cell>` por ponto (deprecado, sai no recharts 4); agora vai
 * no próprio dado, em `fillOpacity`, que o recharts espalha no retângulo.
 *
 * No dado e não em `shape`: passar `shape` liga o `hasCustomShape` do recharts, que
 * desliga o descarte de retângulo de dimensão zero — uma UG com `intangivelDiff === 0`
 * passaria a desenhar um retângulo sem altura por cima da pilha.
 */
export function paretoOpacity(row: { accumulatedPct?: number } | undefined) {
	return row?.accumulatedPct && row.accumulatedPct <= 80 ? 1 : 0.4
}

/** Passo horizontal mínimo entre dois nomes de UG inclinados a -45°, em px. */
const PARETO_LABEL_PITCH = 50
/** Largura que o eixo de percentual e as margens tiram da faixa das barras, em px. */
const PARETO_AXIS_GUTTER = 90
/**
 * Altura reservada para os nomes de UG inclinados a -45°, em px.
 *
 * É o `height` do EIXO que precisa cobri-los, e não a `margin.bottom` do gráfico:
 * o recharts soma a altura do eixo e a da legenda por cima da margem e ancora a
 * legenda no fim da faixa, então aumentar a margem empurra os dois juntos e o vão
 * entre eles continua zero — só encolhe a área de plotagem. Quem transbordava a
 * faixa do eixo e alcançava a legenda era o texto inclinado: "CINDACTA IV" mede
 * ~70px na vertical, contra os 60px que o eixo reservava.
 */
const PARETO_AXIS_HEIGHT = 84
const PARETO_AXIS_HEIGHT_EXPANDED = 110

/** Derivações de layout do `ComparisonChart` (contagem de barras, contêiner, eixo). */
export function computeComparisonLayout<T extends { accumulatedPct?: number }>(
	paretoData: T[],
	plotWidth: number,
	isExpanded: boolean | undefined,
	viewMode: ComparisonViewMode
) {
	/**
	 * Quantas barras cabem sai da largura MEDIDA da área de plotagem, e não do
	 * viewport: o eixo X é nominal — cada barra carrega o nome da UG inclinado a
	 * -45°, e `interval={0}` obriga o recharts a desenhar todos. Quem determina a
	 * colisão é o passo entre barras, e a mesma janela de 1024px dá plotagens
	 * diferentes com a barra lateral aberta ou fechada.
	 *
	 * `PARETO_LABEL_PITCH`: um nome de UG ocupa ~70px de texto, e inclinado a 45°
	 * projeta ~50px na horizontal. Abaixo desse passo os nomes se sobrepõem.
	 *
	 * O teto de 20 é da visão compacta, não do dado — expandir mostra a série
	 * inteira, com rolagem horizontal própria.
	 */
	const compactCount = plotWidth > 0 ? Math.min(20, Math.max(6, Math.floor((plotWidth - PARETO_AXIS_GUTTER) / PARETO_LABEL_PITCH))) : 20
	const displayData = isExpanded ? paretoData : paretoData.slice(0, compactCount)
	// Linhas próprias do Pareto: `displayData` também alimenta o BarChart de Composição
	// (SIAFI × SILOMS), que não quer opacidade nenhuma.
	const paretoRows = displayData.map((row) => ({ ...row, fillOpacity: paretoOpacity(row) }))

	const containerStyle: CSSProperties = isExpanded
		? viewMode === "tree"
			? { width: "2400px", height: "1600px" }
			: {
					width: "100%",
					height: "100%",
					minWidth: `${Math.max(displayData.length * 100, 1200)}px`,
				}
		: { width: "100%", height: "100%" }

	const overflowClass = isExpanded ? (viewMode === "tree" ? "flex-1 overflow-auto custom-scrollbar" : "overflow-x-auto custom-scrollbar pb-2") : ""

	return {
		displayData,
		paretoRows,
		containerStyle,
		overflowClass,
		axisHeight: isExpanded ? PARETO_AXIS_HEIGHT_EXPANDED : PARETO_AXIS_HEIGHT,
		compositionBarSize: isExpanded ? 30 : undefined,
		paretoBarSize: isExpanded ? 40 : undefined,
	}
}
