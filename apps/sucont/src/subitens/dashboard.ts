// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): agregações do
// painel gerencial (conferente, ODS, órgão superior, RAC, Pareto e níveis críticos)
// sobre as UGs já filtradas pelo conferente.
import { computeParetoGroup } from "#/lib/analysis/pareto"
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

/**
 * Pareto das UGs pelo critério compartilhado (`computeParetoGroup`): as UGs, da mais
 * recorrente para a menos, até somar 80% das ocorrências; as duas porcentagens e a lista
 * são desse grupo.
 *
 * O port fixava 20% das UGs e lia a concentração no primeiro ponto a partir de 20%, que
 * já incluía uma UG além das listadas (com 4 UGs, a lista vinha vazia e a concentração era
 * a da 1ª UG).
 */
export function summarizePareto(topUgsByInconsistencias: UgGroup[]) {
	const { group, ugPercentage, issuePercentage } = computeParetoGroup(topUgsByInconsistencias.map((g) => ({ ug: g.ug, count: g.occurrences.length })))
	return { group, ugPercentage, issuePercentage }
}

export type ParetoSummary = ReturnType<typeof summarizePareto>

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
