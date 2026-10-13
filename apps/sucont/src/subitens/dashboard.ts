// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): agregações do
// painel gerencial (conferente, ODS, órgão superior, RAC, Pareto e níveis críticos)
// sobre as UGs já filtradas pelo conferente.
import type { ProcessedData, UgGroup } from "#/subitens/types"
import { getConferente, getOdsForUg, getOrgaoSuperiorForUg } from "#/subitens/ug"

export interface ConferenteSummary {
	name: string
	ugs: string[]
	count: number
}

export interface CountSaldoSummary {
	name: string
	count: number
	saldo: number
}

export interface ParetoEntry {
	ug: string
	count: number
	cumulativeCount: number
	percentage: number
	ugPercentage: number
}

/** Quantas ocorrências cada conta contábil tem. */
export function countOccurrencesByConta(filteredData: UgGroup[]): Record<string, number> {
	const contasCount: Record<string, number> = {}
	for (const group of filteredData) {
		for (const occ of group.occurrences) {
			contasCount[occ.contaContabil] = (contasCount[occ.contaContabil] || 0) + 1
		}
	}
	return contasCount
}

/** Conferentes com as UGs e o número de ocorrências de cada um, do mais carregado ao menos. */
export function summarizeByConferente(filteredData: UgGroup[]): ConferenteSummary[] {
	const conferentesData: Record<string, { ugs: string[]; count: number }> = {}
	for (const group of filteredData) {
		const conferente = getConferente(group.ug)
		if (!conferentesData[conferente]) conferentesData[conferente] = { ugs: [], count: 0 }
		conferentesData[conferente].ugs.push(group.ug)
		conferentesData[conferente].count += group.occurrences.length
	}
	return Object.entries(conferentesData)
		.map(([name, info]) => ({ name, ...info }))
		.sort((a, b) => b.count - a.count)
}

/** Rankings por ODS, por órgão superior e por questão RAC, do maior número de ocorrências ao menor. */
export function summarizeByOdsOrgaoAndRac(filteredData: UgGroup[]): {
	odsList: CountSaldoSummary[]
	orgaoSuperiorList: CountSaldoSummary[]
	racList: { name: string; count: number }[]
} {
	const odsData: Record<string, { count: number; saldo: number }> = {}
	const orgaoSuperiorData: Record<string, { count: number; saldo: number }> = {}
	const racData: Record<string, { count: number }> = {}

	for (const group of filteredData) {
		const ods = getOdsForUg(group.ug)
		const orgao = getOrgaoSuperiorForUg(group.ug)
		if (!odsData[ods]) odsData[ods] = { count: 0, saldo: 0 }
		odsData[ods].count += group.occurrences.length
		odsData[ods].saldo += group.totalSaldo
		if (!orgaoSuperiorData[orgao]) orgaoSuperiorData[orgao] = { count: 0, saldo: 0 }
		orgaoSuperiorData[orgao].count += group.occurrences.length
		orgaoSuperiorData[orgao].saldo += group.totalSaldo
		for (const occ of group.occurrences) {
			if (!racData[occ.racId]) racData[occ.racId] = { count: 0 }
			racData[occ.racId].count += 1
		}
	}

	const odsList = Object.entries(odsData)
		.map(([name, info]) => ({ name, ...info }))
		.sort((a, b) => b.count - a.count)
	const orgaoSuperiorList = Object.entries(orgaoSuperiorData)
		.map(([name, info]) => ({ name, ...info }))
		.sort((a, b) => b.count - a.count)
	const racList = Object.entries(racData)
		.map(([name, info]) => ({ name, ...info }))
		.sort((a, b) => b.count - a.count)

	return { odsList, orgaoSuperiorList, racList }
}

/** Curva de Pareto sobre as UGs já ordenadas da mais para a menos recorrente. */
export function buildParetoData(topUgsByInconsistencias: UgGroup[], totalInconsistencias: number, totalUgsCount: number): ParetoEntry[] {
	return topUgsByInconsistencias.reduce(
		(acc, curr, idx) => {
			const cumulativeCount = (acc.length > 0 ? acc[acc.length - 1].cumulativeCount : 0) + curr.occurrences.length
			acc.push({
				ug: curr.ug,
				count: curr.occurrences.length,
				cumulativeCount,
				percentage: (cumulativeCount / totalInconsistencias) * 100,
				ugPercentage: ((idx + 1) / totalUgsCount) * 100,
			})
			return acc
		},
		[] as { ug: string; count: number; cumulativeCount: number; percentage: number; ugPercentage: number }[]
	)
}

/** UGs dos primeiros 20% e a fatia das ocorrências que elas concentram. */
export function summarizePareto(paretoData: ParetoEntry[]) {
	return {
		top20PercentUgs: paretoData.filter((d) => d.ugPercentage <= 20),
		concentrationPercentage: paretoData.find((d) => d.ugPercentage >= 20)?.percentage || 0,
	}
}

/** Primeiro de cada ranking, para o contexto do assistente de IA. Sem dado, "N/A". */
export function findCriticalLevels(
	odsList: CountSaldoSummary[],
	orgaoSuperiorList: CountSaldoSummary[],
	topUgsByInconsistencias: UgGroup[],
	filteredData: UgGroup[]
) {
	return {
		odsMaisCritico: odsList[0]?.name || "N/A",
		orgaoSuperiorMaisCritico: orgaoSuperiorList[0]?.name || "N/A",
		ugMaiorConcentracao: topUgsByInconsistencias[0]?.ug || "N/A",
		ugMaiorSaldo: [...filteredData].sort((a, b) => b.totalSaldo - a.totalSaldo)[0]?.ug || "N/A",
		odsMaiorImpactoFinanceiro: [...odsList].sort((a, b) => b.saldo - a.saldo)[0]?.name || "N/A",
		orgaoSuperiorMaiorSaldo: [...orgaoSuperiorList].sort((a, b) => b.saldo - a.saldo)[0]?.name || "N/A",
	}
}

/** Ocorrências agrupadas por questão RAC, para a mensagem consolidada. */
export function groupOccurrencesByRac(filteredData: UgGroup[]): Record<string, ProcessedData[]> {
	const occurrencesByRac: Record<string, ProcessedData[]> = {}
	for (const group of filteredData) {
		for (const occ of group.occurrences) {
			if (!occurrencesByRac[occ.racId]) occurrencesByRac[occ.racId] = []
			occurrencesByRac[occ.racId].push(occ)
		}
	}
	return occurrencesByRac
}
