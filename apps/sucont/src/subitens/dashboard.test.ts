import { describe, expect, it } from "bun:test"
import {
	countOccurrencesByConta,
	findCriticalLevels,
	groupOccurrencesByRac,
	summarizeByConferente,
	summarizeByOdsOrgaoAndRac,
	summarizePareto,
} from "#/subitens/dashboard"
import type { UgGroup } from "#/subitens/types"

const group = (ug: string, contas: [string, number, string?][]): UgGroup => {
	const occurrences = contas.map(([conta, saldo, racId]) => ({ ug, contaContabil: conta, contaCorrente: "99", saldo, racId: racId ?? "RAC 28" }))
	return { ug, occurrences, totalSaldo: occurrences.reduce((s, o) => s + o.saldo, 0) }
}

// 120004 (BABR: COMPREP / VI COMAR, 1S ELIANA), 120006 (GAP-BR: SEFA / DIRAD, 1T JEFFERSON LUÍS),
// 120005 (PABR: SEFA / DIRAD, 1S ELIANA), 999999 sem cadastro.
const DATA: UgGroup[] = [
	group("120004 BABR", [
		["A", 10],
		["B", 20],
	]),
	group("120006 GAP-BR", [
		["A", 500],
		["C", 1],
		["A", 2, "RAC 30"],
	]),
	group("120005 PABR", [["B", 3]]),
	group("999999 X", [["D", 1000]]),
]

describe("countOccurrencesByConta", () => {
	it("conta ocorrências por conta contábil", () => {
		expect(countOccurrencesByConta(DATA)).toEqual({ A: 3, B: 2, C: 1, D: 1 })
		expect(countOccurrencesByConta([])).toEqual({})
	})
})

describe("summarizeByConferente", () => {
	it("agrupa UGs por conferente, do maior número de ocorrências ao menor (empate mantém a ordem de chegada)", () => {
		expect(summarizeByConferente(DATA)).toEqual([
			{ name: "1S ELIANA", ugs: ["120004 BABR", "120005 PABR"], count: 3 },
			{ name: "1T JEFFERSON LUÍS", ugs: ["120006 GAP-BR"], count: 3 },
			{ name: "Não atribuído", ugs: ["999999 X"], count: 1 },
		])
	})
})

describe("summarizeByOdsOrgaoAndRac", () => {
	it("soma ocorrências e saldo por ODS e órgão superior, e conta por RAC", () => {
		expect(summarizeByOdsOrgaoAndRac(DATA)).toEqual({
			odsList: [
				{ name: "SEFA", count: 4, saldo: 506 },
				{ name: "COMPREP", count: 2, saldo: 30 },
				{ name: "OUTROS", count: 1, saldo: 1000 },
			],
			orgaoSuperiorList: [
				{ name: "DIRAD", count: 4, saldo: 506 },
				{ name: "VI COMAR", count: 2, saldo: 30 },
				{ name: "OUTROS", count: 1, saldo: 1000 },
			],
			racList: [
				{ name: "RAC 28", count: 6 },
				{ name: "RAC 30", count: 1 },
			],
		})
	})

	it("sem dados, listas vazias", () => {
		expect(summarizeByOdsOrgaoAndRac([])).toEqual({ odsList: [], orgaoSuperiorList: [], racList: [] })
	})
})

describe("Pareto", () => {
	const sorted = [...DATA].sort((a, b) => b.occurrences.length - a.occurrences.length)

	it("o grupo vai até 80% das ocorrências, e as porcentagens são dele", () => {
		// 7 ocorrências: 3 + 2 + 1 = 6 ≥ 5,6 → três UGs de quatro.
		const summary = summarizePareto(sorted)
		expect(summary.group).toEqual([
			{ ug: "120006 GAP-BR", count: 3 },
			{ ug: "120004 BABR", count: 2 },
			{ ug: "120005 PABR", count: 1 },
		])
		expect(summary.ugPercentage).toBe(75)
		expect(summary.issuePercentage).toBeCloseTo((6 / 7) * 100)
	})

	it("sem corte fixo de 20% das UGs", () => {
		const many = Array.from({ length: 10 }, (_, i) => group(`U${i}`, [["A", 1]]))
		const summary = summarizePareto(many)
		expect(summary.group).toHaveLength(8)
		expect([summary.ugPercentage, summary.issuePercentage]).toEqual([80, 80])
		expect(summarizePareto([])).toEqual({ group: [], ugPercentage: 0, issuePercentage: 0 })
	})
})

describe("findCriticalLevels", () => {
	it("pega o primeiro de cada ranking", () => {
		const { odsList, orgaoSuperiorList } = summarizeByOdsOrgaoAndRac(DATA)
		const sorted = [...DATA].sort((a, b) => b.occurrences.length - a.occurrences.length)
		expect(findCriticalLevels(odsList, orgaoSuperiorList, sorted, DATA)).toEqual({
			odsMaisCritico: "SEFA",
			orgaoSuperiorMaisCritico: "DIRAD",
			ugMaiorConcentracao: "120006 GAP-BR",
			ugMaiorSaldo: "999999 X",
			odsMaiorImpactoFinanceiro: "OUTROS",
			orgaoSuperiorMaiorSaldo: "OUTROS",
		})
	})

	it("sem dados, N/A em tudo", () => {
		expect(findCriticalLevels([], [], [], [])).toEqual({
			odsMaisCritico: "N/A",
			orgaoSuperiorMaisCritico: "N/A",
			ugMaiorConcentracao: "N/A",
			ugMaiorSaldo: "N/A",
			odsMaiorImpactoFinanceiro: "N/A",
			orgaoSuperiorMaiorSaldo: "N/A",
		})
	})

	it("não reordena as listas recebidas", () => {
		const { odsList } = summarizeByOdsOrgaoAndRac(DATA)
		const before = odsList.map((o) => o.name)
		findCriticalLevels(odsList, [], [], DATA)
		expect(odsList.map((o) => o.name)).toEqual(before)
		expect(DATA.map((g) => g.ug)).toEqual(["120004 BABR", "120006 GAP-BR", "120005 PABR", "999999 X"])
	})
})

describe("groupOccurrencesByRac", () => {
	it("agrupa as ocorrências por questão, na ordem em que aparecem", () => {
		const grouped = groupOccurrencesByRac(DATA)
		expect(Object.keys(grouped)).toEqual(["RAC 28", "RAC 30"])
		expect(grouped["RAC 28"].map((o) => `${o.ug}:${o.contaContabil}`)).toEqual([
			"120004 BABR:A",
			"120004 BABR:B",
			"120006 GAP-BR:A",
			"120006 GAP-BR:C",
			"120005 PABR:B",
			"999999 X:D",
		])
		expect(grouped["RAC 30"]).toEqual([{ ug: "120006 GAP-BR", contaContabil: "A", contaCorrente: "99", saldo: 2, racId: "RAC 30" }])
	})
})
