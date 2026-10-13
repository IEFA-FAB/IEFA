// Extraído de routes/auditor.tsx (port do SIAFI-x-SILOMS-Auditor): derivações
// puras do painel, que a página chama dentro dos mesmos useMemo de antes.

import type { FinancialRecord, TimeFilter } from "../types"

export type HierarchyLevel = "ODS" | "ORGAO" | "UG"

export interface BaseFilterCriteria {
	searchTerm: string
	selectedRisk: string
	selectedHierarchyLevel: HierarchyLevel
	selectedHierarchyFilter: string[]
}

/** 3a. Filtro base: busca, risco e recorte de hierarquia. */
export const filterBaseData = (allData: FinancialRecord[], criteria: BaseFilterCriteria): FinancialRecord[] => {
	const { searchTerm, selectedRisk, selectedHierarchyLevel, selectedHierarchyFilter } = criteria
	return allData.filter((item) => {
		const matchSearch = item.ug.toLowerCase().includes(searchTerm.toLowerCase()) || item.cod.includes(searchTerm)
		const matchRisk = selectedRisk === "TODOS" || item.riskLevel === selectedRisk

		let matchHierarchy = true
		if (selectedHierarchyFilter.length > 0 && !selectedHierarchyFilter.includes("TODOS")) {
			if (selectedHierarchyLevel === "ODS") matchHierarchy = selectedHierarchyFilter.includes(item.ods)
			else if (selectedHierarchyLevel === "ORGAO") matchHierarchy = selectedHierarchyFilter.includes(item.orgaoSuperior)
			else matchHierarchy = selectedHierarchyFilter.includes(item.ug)
		}

		return matchSearch && matchHierarchy && matchRisk
	})
}

/** Distância, em meses, entre um período e o anterior no agrupamento escolhido. */
export const getPeriodGap = (timeFilter: TimeFilter): number => {
	let gap = 1
	if (timeFilter === "TRIMESTRAL") gap = 3
	if (timeFilter === "SEMESTRAL") gap = 6
	if (timeFilter === "ANUAL") gap = 12
	return gap
}

const matchesMonthAndGroup = (item: FinancialRecord, month: string, selectedGroup: string): boolean =>
	item.date === month && (selectedGroup === "ALL" || item.group === selectedGroup)

/** 3d. Registros do período anterior ao selecionado (YYYY-MM), no grupo escolhido. */
export const selectPreviousKpiData = (
	baseFilteredData: FinancialRecord[],
	selectedMonth: string,
	uniqueMonths: string[],
	selectedGroup: string,
	timeFilter: TimeFilter
): FinancialRecord[] => {
	if (!selectedMonth || selectedMonth === "TODOS" || uniqueMonths.length === 0) return []

	const gap = getPeriodGap(timeFilter)

	const [yearStr, monthStr] = selectedMonth.split("-")
	let year = parseInt(yearStr, 10)
	let month = parseInt(monthStr, 10)

	month -= gap
	while (month <= 0) {
		month += 12
		year -= 1
	}

	const prevMonthStr = `${year}-${month.toString().padStart(2, "0")}`

	return baseFilteredData.filter((item) => matchesMonthAndGroup(item, prevMonthStr, selectedGroup))
}

export interface KpiStats {
	totalDiff: number
	totalSiafi: number
	totalSiloms: number
	topOffender: FinancialRecord | null
	totalUGsCount: number
	healthScore: number
	diffVar: number
	siafiVar: number
	silomsVar: number
	topOffenderICC: number
}

const sumBy = (records: FinancialRecord[], pick: (r: FinancialRecord) => number): number => records.reduce((acc, curr) => acc + pick(curr), 0)

const calculateVar = (curr: number, prev: number) => {
	if (prev === 0) return curr > 0 ? 100 : 0
	return ((curr - prev) / prev) * 100
}

/** ICC da maior divergência: 100 quando ela é zero sem saldo SIAFI, 0 sem registro. */
const computeTopOffenderICC = (topOffender: FinancialRecord | null): number =>
	topOffender && topOffender.siafiValue > 0 ? Math.max(0, (1 - topOffender.difference / topOffender.siafiValue) * 100) : topOffender?.difference === 0 ? 100 : 0

/** 4. KPIs do mês selecionado contra o período anterior. */
export const computeKpiStats = (kpiData: FinancialRecord[], previousKpiData: FinancialRecord[], currentMonthVisuals: FinancialRecord[]): KpiStats => {
	const totalDiff = sumBy(kpiData, (r) => r.difference)
	const totalSiafi = sumBy(kpiData, (r) => r.siafiValue)
	const totalSiloms = sumBy(kpiData, (r) => r.silomsValue)

	const prevDiff = sumBy(previousKpiData, (r) => r.difference)
	const prevSiafi = sumBy(previousKpiData, (r) => r.siafiValue)
	const prevSiloms = sumBy(previousKpiData, (r) => r.silomsValue)

	const diffVar = calculateVar(totalDiff, prevDiff)
	const siafiVar = calculateVar(totalSiafi, prevSiafi)
	const silomsVar = calculateVar(totalSiloms, prevSiloms)

	const topOffender =
		currentMonthVisuals.length > 0 ? currentMonthVisuals.reduce((prev, current) => (prev.difference > current.difference ? prev : current)) : null

	const topOffenderICC = computeTopOffenderICC(topOffender)

	const totalUGsCount = new Set(currentMonthVisuals.map((d) => d.ug)).size

	const iccScore = totalSiafi > 0 ? Math.max(0, (1 - totalDiff / totalSiafi) * 100) : totalDiff === 0 ? 100 : 0

	return {
		totalDiff,
		totalSiafi,
		totalSiloms,
		topOffender,
		totalUGsCount,
		healthScore: iccScore,
		diffVar,
		siafiVar,
		silomsVar,
		topOffenderICC,
	}
}

export interface TrendSeries {
	diff: number[]
	siafi: number[]
	siloms: number[]
}

/** 3e. Série dos seis últimos períodos (no passo do agrupamento) para os mini gráficos. */
export const computeTrendSeries = (
	baseFilteredData: FinancialRecord[],
	selectedMonth: string,
	uniqueMonths: string[],
	selectedGroup: string,
	timeFilter: TimeFilter
): TrendSeries => {
	if (!selectedMonth || uniqueMonths.length === 0) return { diff: [], siafi: [], siloms: [] }
	const currentIndex = uniqueMonths.indexOf(selectedMonth)

	const gap = getPeriodGap(timeFilter)

	const diffs: number[] = []
	const siafis: number[] = []
	const siloms: number[] = []

	for (let i = 5; i >= 0; i--) {
		const idx = currentIndex - i * gap
		if (idx >= 0) {
			const month = uniqueMonths[idx]
			const monthData = baseFilteredData.filter((item) => matchesMonthAndGroup(item, month, selectedGroup))
			diffs.push(sumBy(monthData, (r) => r.difference))
			siafis.push(sumBy(monthData, (r) => r.siafiValue))
			siloms.push(sumBy(monthData, (r) => r.silomsValue))
		}
	}

	return { diff: diffs, siafi: siafis, siloms: siloms }
}

/** Rótulo de comparação do ranking. */
export const buildComparisonLabel = (kpiData: FinancialRecord[], selectedMonth: string, timeFilter: TimeFilter): string => {
	if (!selectedMonth || kpiData.length === 0) return `Comparando ${timeFilter}`
	const sampleRecord = kpiData[0]

	const currShortYear = sampleRecord.year.toString().slice(-2)
	const currMonthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
	const currShort = `${currMonthNames[sampleRecord.monthIndex]}/${currShortYear}`
	const prevDate = sampleRecord.previousDate || "N/A"

	return `Comparando ${currShort} contra ${prevDate}`
}

/** Só o recorte de hierarquia. É o que o telão respeita — ele tem lâmina por natureza. */
export const buildHierarchyLabel = (selectedHierarchyFilter: string[], selectedHierarchyLevel: HierarchyLevel): string =>
	selectedHierarchyFilter.length === 0 || selectedHierarchyFilter.includes("TODOS")
		? "todas as UGs"
		: `${selectedHierarchyLevel === "ORGAO" ? "Órgão" : selectedHierarchyLevel} ${selectedHierarchyFilter.join(", ")}`

const HIERARCHY_PLURAL: Record<HierarchyLevel, string> = { ODS: "ODSs", ORGAO: "Órgãos", UG: "UGs" }

export interface HierarchyLists {
	uniqueODS: string[]
	uniqueOrgaos: string[]
	uniqueUGs: string[]
}

/** Opções do combobox de hierarquia: "Todas as …" seguida das unidades do nível. */
export const buildHierarchyOptions = (selectedHierarchyLevel: HierarchyLevel, lists: HierarchyLists): { value: string; label: string }[] => {
	const { uniqueODS, uniqueOrgaos, uniqueUGs } = lists
	const byLevel: Record<HierarchyLevel, string[]> = { ODS: uniqueODS, ORGAO: uniqueOrgaos, UG: uniqueUGs }
	return [
		{
			value: "TODOS",
			label: `Todas as ${HIERARCHY_PLURAL[selectedHierarchyLevel]}`,
		},
		...byLevel[selectedHierarchyLevel].map((opt) => ({
			value: opt,
			label: opt,
		})),
	]
}
