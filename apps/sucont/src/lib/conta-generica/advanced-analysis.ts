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

// Pareto
function computePareto(sortedByCount: UgStat[], ugCount: number, totalInc: number): ParetoData {
	let running = 0
	let paretoIdx = -1
	for (let i = 0; i < sortedByCount.length; i++) {
		running += sortedByCount[i].count
		if (running >= totalInc * 0.8 && paretoIdx === -1) paretoIdx = i
	}
	const paretoSlice = sortedByCount.slice(0, Math.max(3, paretoIdx + 1)).slice(0, 10)
	return {
		ugPercentage: Math.round(((paretoIdx + 1) / ugCount) * 100),
		inconsistencyPercentage: Math.round((paretoSlice.reduce((a, c) => a + c.count, 0) / totalInc) * 100),
		topUgs: paretoSlice,
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

// Priority list
function buildPriorityList(ugStats: UgStat[]): PriorityItem[] {
	const maxCount = Math.max(...ugStats.map((u) => u.count))
	const maxVolume = Math.max(...ugStats.map((u) => u.volume))
	return ugStats
		.map((u) => ({
			...u,
			priorityScore: Math.round((u.count / maxCount) * 50 + (u.volume / maxVolume) * 50),
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
