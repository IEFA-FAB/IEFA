// Extraído de routes/conta-generica.tsx (port do analistacontagenerica): Pareto,
// mapa de risco por ODS, níveis críticos e lista de prioridade.
import { type GroupedData, getOds, getOs } from "#/lib/conta-generica/helpers"

export interface UgStat {
	ug: string
	count: number
	volume: number
	ods: string
	os: string
}

export interface ParetoData {
	ugPercentage: number
	inconsistencyPercentage: number
	topUgs: UgStat[]
}

export interface OdsRisk {
	ods: string
	count: number
	volume: number
	percentage: number
}

export interface CriticalSummary {
	ods: string
	os: string
	ugCount: string
	ugVolume: string
}

export type PriorityItem = UgStat & { priorityScore: number }

export interface AdvancedAnalysis {
	paretoData: ParetoData
	odsRiskMap: OdsRisk[]
	criticalSummary: CriticalSummary
	priorityList: PriorityItem[]
	totalFinancialImpact: number
}

type Aggregate = Record<string, { count: number; volume: number }>

interface UgAggregation {
	ugStats: UgStat[]
	odsAgg: Aggregate
	osAgg: Aggregate
	totalInc: number
	totalVol: number
}

function addToAggregate(agg: Aggregate, key: string, count: number, volume: number) {
	if (!agg[key]) agg[key] = { count: 0, volume: 0 }
	agg[key].count += count
	agg[key].volume += volume
}

/** Quantidade de registros e soma dos saldos de uma UG. */
function countUgRecords(contas: GroupedData[string]): { ugCount: number; ugVolume: number } {
	let ugCount = 0
	let ugVolume = 0
	for (const regs of Object.values(contas)) {
		for (const reg of regs) {
			ugCount++
			ugVolume += reg.saldo
		}
	}
	return { ugCount, ugVolume }
}

function aggregateByUg(grouped: GroupedData): UgAggregation {
	const ugStats: UgStat[] = []
	const odsAgg: Aggregate = {}
	const osAgg: Aggregate = {}
	let totalInc = 0
	let totalVol = 0

	for (const [ug, contas] of Object.entries(grouped)) {
		const ods = getOds(ug)
		const os = getOs(ug)
		const { ugCount, ugVolume } = countUgRecords(contas)

		totalInc += ugCount
		totalVol += ugVolume
		ugStats.push({ ug, count: ugCount, volume: ugVolume, ods, os })

		addToAggregate(odsAgg, ods, ugCount, ugVolume)
		addToAggregate(osAgg, os, ugCount, ugVolume)
	}

	return { ugStats, odsAgg, osAgg, totalInc, totalVol }
}

/** Fração do total que define o grupo do Pareto ("os poucos vitais"). */
const PARETO_SHARE = 0.8

/**
 * Pareto: as UGs, em ordem decrescente de inconsistências, até a soma alcançar 80% do
 * total. As duas porcentagens são sobre ESSE conjunto: quantas UGs ele tem (sobre o total
 * de UGs) e quantas inconsistências ele soma (sobre o total). A frase da tela ("X% das
 * UGs concentram Y% das inconsistências") passa a ler um mesmo grupo.
 *
 * O port media as UGs até alcançar os 80%, mas somava as inconsistências de outro recorte
 * (no mínimo 3 e no máximo 10 UGs): com uma UG dominante, dizia "25% das UGs concentram
 * 96%", quando a UG sozinha tinha 83%. Empate na fronteira segue a ordem estável da
 * lista (a do `Object.entries`).
 *
 * `topUgs` é o próprio grupo, na mesma ordem; a tela mostra as primeiras.
 */
function computePareto(sortedByCount: UgStat[], ugCount: number, totalInc: number): ParetoData {
	if (ugCount === 0 || totalInc === 0) return { ugPercentage: 0, inconsistencyPercentage: 0, topUgs: [] }
	const topUgs: UgStat[] = []
	let running = 0
	for (const ug of sortedByCount) {
		if (running >= totalInc * PARETO_SHARE) break
		topUgs.push(ug)
		running += ug.count
	}
	return {
		ugPercentage: Math.round((topUgs.length / ugCount) * 100),
		inconsistencyPercentage: Math.round((running / totalInc) * 100),
		topUgs,
	}
}

// ODS risk map
function buildOdsRiskMap(odsAgg: Aggregate, totalInc: number): OdsRisk[] {
	return Object.entries(odsAgg)
		.map(([ods, d]) => ({ ods, count: d.count, volume: d.volume, percentage: Math.round((d.count / totalInc) * 100) }))
		.sort((a, b) => b.count - a.count)
}

// Critical summary
function buildCriticalSummary(riskMap: OdsRisk[], osAgg: Aggregate, sortedByCount: UgStat[], ugStats: UgStat[]): CriticalSummary {
	const criticalOds = riskMap[0]?.ods || "N/A"
	const criticalOs = Object.entries(osAgg).sort((a, b) => b[1].count - a[1].count)[0]?.[0] || "N/A"
	return {
		ods: criticalOds,
		os: criticalOs,
		ugCount: sortedByCount[0]?.ug || "N/A",
		ugVolume: [...ugStats].sort((a, b) => b.volume - a.volume)[0]?.ug || "N/A",
	}
}

/** Parcela de `value` sobre o maior valor do conjunto; 0 quando o maior não é positivo. */
function shareOfMax(value: number, max: number): number {
	return max > 0 ? value / max : 0
}

/**
 * Prioridade: metade pela contagem relativa à maior, metade pelo volume relativo ao maior.
 * Sem volume positivo no conjunto (saldos que se anulam, ou todos negativos), a metade do
 * volume vale 0 para todas as UGs; antes a divisão por zero dava `NaN` e a lista saía na
 * ordem de chegada.
 */
function buildPriorityList(ugStats: UgStat[]): PriorityItem[] {
	const maxCount = Math.max(...ugStats.map((u) => u.count))
	const maxVolume = Math.max(...ugStats.map((u) => u.volume))
	return ugStats
		.map((u) => ({
			...u,
			priorityScore: Math.round(shareOfMax(u.count, maxCount) * 50 + shareOfMax(u.volume, maxVolume) * 50),
		}))
		.sort((a, b) => b.priorityScore - a.priorityScore)
		.slice(0, 5)
}

export const performAdvancedAnalysis = (grouped: GroupedData): AdvancedAnalysis => {
	const { ugStats, odsAgg, osAgg, totalInc, totalVol } = aggregateByUg(grouped)
	const sortedByCount = [...ugStats].sort((a, b) => b.count - a.count)
	const paretoData = computePareto(sortedByCount, ugStats.length, totalInc)
	const riskMap = buildOdsRiskMap(odsAgg, totalInc)
	const criticalSummary = buildCriticalSummary(riskMap, osAgg, sortedByCount, ugStats)
	const priorityList = buildPriorityList(ugStats)
	return { paretoData, odsRiskMap: riskMap, criticalSummary, priorityList, totalFinancialImpact: totalVol }
}
