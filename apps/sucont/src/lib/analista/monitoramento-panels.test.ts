// Caracterização das derivações dos painéis da rota /monitoramento.
import { describe, expect, it } from "bun:test"
import type { ProcessedRow } from "#/lib/analista/types"
import { UNIDADES_GESTORAS } from "#/lib/ug/registry"
import {
	computeDashboardData,
	computeDecisaoData,
	computeEstrategicoData,
	computeManagerialData,
	describeTopOdsShare,
	ODS_PIE_COLORS,
	PIE_COLORS,
} from "./monitoramento-panels"

function row(partial: Partial<ProcessedRow> & Pick<ProcessedRow, "ug" | "saldo" | "classificacao">): ProcessedRow {
	return { mes: "JAN/2026", conta: "115110101", descricao: "MERC", ...partial }
}

// 120062 = BASP (COMPREP / IV COMAR), 120039 = GAP-RJ (SEFA / DIRAD), ambas da 1T ÉRIKA VICENTE.
// 999001 não está no registro: ODS e órgão "OUTROS", conferente "NÃO ATRIBUÍDO".
const ROWS: ProcessedRow[] = [
	row({ ug: "120062", saldo: -100, classificacao: "COBRANÇA", questaoRAC: "Questão 35" }),
	row({ ug: "120062", saldo: 50, classificacao: "COBRANÇA COM OBSERVAÇÃO", questaoRAC: "Questão 35", descricao: "OUTRA" }),
	row({ ug: "120039", conta: "123119908", descricao: "BENS", saldo: 1000, classificacao: "COBRANÇA", questaoRAC: "Questão 26" }),
	row({ ug: "999001", conta: "111", descricao: "X", saldo: 10, classificacao: "COBRANÇA" }),
	row({ ug: "120002", saldo: 5, classificacao: "EXCEÇÃO PREVISTA", questaoRAC: "Questão 35" }),
	row({ ug: "120002", conta: "222", saldo: 7, classificacao: "FORA DO ESCOPO PARAMETRIZADO" }),
]

describe("painéis do monitoramento: sem dado", () => {
	it("devolvem null", () => {
		expect(computeDashboardData([])).toBeNull()
		expect(computeManagerialData([])).toBeNull()
		expect(computeEstrategicoData([])).toBeNull()
		expect(computeDecisaoData([], null)).toBeNull()
	})
})

describe("computeDashboardData", () => {
	it("conta registros, cobranças (com e sem observação), UGs, exceções, fora do escopo e volume absoluto", () => {
		expect(computeDashboardData(ROWS)).toEqual({
			totalRegistros: 6,
			totalCobrancas: 4,
			ugsComInconsistencia: 3,
			totalExcecoes: 1,
			totalForaEscopo: 1,
			volumeFinanceiro: 1160,
		})
	})
})

describe("computeManagerialData", () => {
	it("agrega cobranças por UG, questão do RAC e conferente", () => {
		expect(computeManagerialData(ROWS)).toEqual({
			totalRiskValue: 1160,
			topUgs: [
				{ ug: "120062", count: 2, value: 150 },
				{ ug: "120039", count: 1, value: 1000 },
				{ ug: "999001", count: 1, value: 10 },
			],
			topRacs: [
				{ name: "Questão 35", value: 2, fill: PIE_COLORS[0] },
				{ name: "Questão 26", value: 1, fill: PIE_COLORS[1] },
				{ name: "Outras Inconsistências", value: 1, fill: PIE_COLORS[2] },
			],
			totalIssues: 4,
			conferentes: [
				{ name: "1T ÉRIKA VICENTE", count: 3, ugs: ["120039", "120062"] },
				{ name: "NÃO ATRIBUÍDO", count: 1, ugs: ["999001"] },
			],
		})
	})

	it("corta o top de UGs em 10 e recicla a paleta depois da sexta questão", () => {
		const many = Array.from({ length: 12 }, (_, i) =>
			row({ ug: `9990${String(i).padStart(2, "0")}`, saldo: 1, classificacao: "COBRANÇA", questaoRAC: `Questão ${i + 1}` })
		)
		const result = computeManagerialData(many)
		expect(result?.topUgs).toHaveLength(10)
		expect(result?.topRacs).toHaveLength(12)
		expect(result?.topRacs[6].fill).toBe(PIE_COLORS[0])
	})

	it("sem cobrança, zera os agregados", () => {
		expect(computeManagerialData([ROWS[4]])).toEqual({ totalRiskValue: 0, topUgs: [], topRacs: [], totalIssues: 0, conferentes: [] })
	})
})

describe("computeEstrategicoData", () => {
	it("agrega cobranças por ODS, órgão superior e conta, com percentual sobre o total", () => {
		expect(computeEstrategicoData(ROWS)).toEqual({
			totalRiskValue: 1160,
			topOds: [
				{ name: "COMPREP", count: 2, value: 150, percent: 50, fill: ODS_PIE_COLORS[0] },
				{ name: "SEFA", count: 1, value: 1000, percent: 25, fill: ODS_PIE_COLORS[1] },
				{ name: "OUTROS", count: 1, value: 10, percent: 25, fill: ODS_PIE_COLORS[2] },
			],
			topOrgaosSuperiores: [
				{ name: "IV COMAR", count: 2, value: 150, percent: 50 },
				{ name: "DIRAD", count: 1, value: 1000, percent: 25 },
				{ name: "OUTROS", count: 1, value: 10, percent: 25 },
			],
			// A descrição da conta é a da primeira linha que a trouxe.
			topContas: [
				{ conta: "115110101", count: 2, value: 150, descricao: "MERC" },
				{ conta: "123119908", count: 1, value: 1000, descricao: "BENS" },
				{ conta: "111", count: 1, value: 10, descricao: "X" },
			],
			totalIssues: 4,
		})
	})

	it("corta contas e órgãos em 10 e recicla a paleta de ODS depois da sexta", () => {
		const byOds = new Map<string, string>()
		const byOrgao = new Map<string, string>()
		for (const [codigo, ug] of Object.entries(UNIDADES_GESTORAS)) {
			if (!byOds.has(ug.ods)) byOds.set(ug.ods, codigo)
			if (!byOrgao.has(ug.orgaoSuperior)) byOrgao.set(ug.orgaoSuperior, codigo)
		}
		const ugs = [...new Set([...byOds.values(), ...byOrgao.values()])]
		const rows = ugs.map((ug, i) => row({ ug, conta: String(100 + i), saldo: 1, classificacao: "COBRANÇA" }))
		const result = computeEstrategicoData(rows)
		expect(byOds.size).toBeGreaterThan(6)
		expect(byOrgao.size).toBeGreaterThan(10)
		expect(result?.topOds[6].fill).toBe(ODS_PIE_COLORS[0])
		expect(result?.topContas).toHaveLength(10)
		expect(result?.topOrgaosSuperiores).toHaveLength(10)
	})
})

describe("computeDecisaoData", () => {
	it("calcula Pareto, prioridade por score e níveis críticos", () => {
		const estrategico = computeEstrategicoData(ROWS)
		const result = computeDecisaoData(ROWS, estrategico)
		expect(result?.pareto.totalUgs).toBe(3)
		// 4 cobranças: 2 + 1 + 1 — só com as três UGs a soma alcança 80% (3,2).
		expect(result?.pareto.ugPercentage).toBe(100)
		expect(result?.pareto.issuePercentage).toBe(100)
		// Score = 40% volume relativo + 40% valor relativo + 20% fixo.
		expect(result?.priorities.map((p) => p.ug)).toEqual(["120039", "120062", "999001"])
		expect(result?.priorities[0]).toEqual({ ug: "120039", count: 1, value: 1000, nome: "GAP-RJ", ods: "SEFA", superior: "DIRAD", score: 0.8 })
		expect(result?.priorities[1].score).toBeCloseTo(0.66)
		expect(result?.priorities[2]).toEqual({ ug: "999001", count: 1, value: 10, nome: "UG 999001", ods: "OUTROS", superior: "OUTROS", score: 0.404 })
		// O grupo do Pareto sai pela contagem, a mesma ordem das porcentagens (o port o
		// listava pela prioridade, e a lista não era o grupo medido).
		expect(result?.pareto.topUgs.map((p) => p.ug)).toEqual(["120062", "120039", "999001"])
		expect(result?.criticalLevels).toEqual({ ods: "COMPREP", superior: "IV COMAR", ugCount: "120062", ugValue: "120039" })
	})

	it("sem o painel estratégico, ODS e órgão críticos ficam em traço", () => {
		expect(computeDecisaoData(ROWS, null)?.criticalLevels).toEqual({ ods: "-", superior: "-", ugCount: "120062", ugValue: "120039" })
	})

	it("corta as prioridades em 15; o grupo do Pareto não tem corte", () => {
		const many = Array.from({ length: 18 }, (_, i) => row({ ug: `9990${String(i).padStart(2, "0")}`, saldo: i + 1, classificacao: "COBRANÇA" }))
		const result = computeDecisaoData(many, null)
		expect(result?.priorities).toHaveLength(15)
		// 18 UGs com uma cobrança cada: 80% de 18 = 14,4 → 15 UGs.
		expect(result?.pareto.topUgs).toHaveLength(15)
		expect([result?.pareto.ugPercentage, result?.pareto.issuePercentage]).toEqual([83, 83])
	})

	it("sem cobrança, o Pareto fica zerado (o port mostrava NaN%)", () => {
		const result = computeDecisaoData([ROWS[4]], null)
		expect(result).toEqual({
			pareto: { totalUgs: 0, ugPercentage: 0, issuePercentage: 0, topUgs: [] },
			priorities: [],
			criticalLevels: { ods: "-", superior: "-", ugCount: "-", ugValue: "-" },
		})
	})
})

describe("describeTopOdsShare", () => {
	it("mostra o percentual do ODS do topo", () => {
		expect(describeTopOdsShare(computeEstrategicoData(ROWS)?.topOds ?? [])).toBe("50.0% das inconsistências")
	})

	it("sem cobrança não há ODS no topo, e a legenda diz isso (o port mostrava undefined%)", () => {
		const topOds = computeEstrategicoData([ROWS[4]])?.topOds ?? []
		expect(topOds).toEqual([])
		expect(describeTopOdsShare(topOds)).toBe("nenhuma inconsistência no recorte")
	})
})

describe("computeDecisaoData: Pareto", () => {
	it("o grupo, as porcentagens e a lista saem da mesma ordenação por contagem", () => {
		// 120062: 6 cobranças de valor baixo; 120039: 1 cobrança de valor alto (prioridade maior).
		const rows = [
			...Array.from({ length: 6 }, () => row({ ug: "120062", saldo: 1, classificacao: "COBRANÇA" })),
			row({ ug: "120039", saldo: 1_000_000, classificacao: "COBRANÇA" }),
			row({ ug: "999001", saldo: 1, classificacao: "COBRANÇA" }),
		]
		const result = computeDecisaoData(rows, null)
		expect(result?.priorities[0].ug).toBe("120039")
		// 6 de 8 = 75% < 80% → entra a próxima pela contagem.
		expect(result?.pareto.topUgs.map((u) => u.ug)).toEqual(["120062", "120039"])
		expect([result?.pareto.ugPercentage, result?.pareto.issuePercentage]).toEqual([67, 88])
	})
})
