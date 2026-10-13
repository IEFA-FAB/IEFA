import { describe, expect, it } from "bun:test"
import { performAdvancedAnalysis } from "#/lib/conta-generica/advanced-analysis"
import type { GroupedData } from "#/lib/conta-generica/helpers"

const regs = (...saldos: number[]) => saldos.map((saldo, i) => ({ mes: `M${i}`, saldo }))

describe("performAdvancedAnalysis", () => {
	// 120001 GABAER (GABAER/GABAER) · 120004 BABR (COMPREP/VI COMAR) ·
	// 120006 GAP-BR (SEFA/DIRAD) · 120005 PABR (SEFA/DIRAD) · 888888 fora do cadastro.
	const grouped: GroupedData = {
		"120001": { "11199": regs(100, 50), "21299": regs(10) },
		"120004": { "11199": regs(1000) },
		"120006": { "11199": regs(5, 5, 5, 5) },
		"120005": { "31199": regs(1) },
		"888888": { "11199": regs(2) },
	}

	it("monta Pareto, mapa por ODS, níveis críticos, prioridades e impacto", () => {
		expect(performAdvancedAnalysis(grouped)).toEqual({
			// 10 inconsistências; 80% = 8 → alcançado na 3ª UG (4 + 3 + 1).
			paretoData: {
				ugPercentage: 60,
				inconsistencyPercentage: 80,
				topUgs: [
					{ ug: "120006", count: 4, volume: 20, ods: "SEFA", os: "DIRAD" },
					{ ug: "120001", count: 3, volume: 160, ods: "GABAER", os: "GABAER" },
					{ ug: "120004", count: 1, volume: 1000, ods: "COMPREP", os: "VI COMAR" },
				],
			},
			odsRiskMap: [
				{ ods: "SEFA", count: 5, volume: 21, percentage: 50 },
				{ ods: "GABAER", count: 3, volume: 160, percentage: 30 },
				{ ods: "COMPREP", count: 1, volume: 1000, percentage: 10 },
				{ ods: "OUTROS", count: 1, volume: 2, percentage: 10 },
			],
			criticalSummary: { ods: "SEFA", os: "DIRAD", ugCount: "120006", ugVolume: "120004" },
			priorityList: [
				{ ug: "120004", count: 1, volume: 1000, ods: "COMPREP", os: "VI COMAR", priorityScore: 63 },
				{ ug: "120006", count: 4, volume: 20, ods: "SEFA", os: "DIRAD", priorityScore: 51 },
				{ ug: "120001", count: 3, volume: 160, ods: "GABAER", os: "GABAER", priorityScore: 46 },
				// Empate: vale a ordem do Object.entries (código numérico crescente).
				{ ug: "120005", count: 1, volume: 1, ods: "SEFA", os: "DIRAD", priorityScore: 13 },
				{ ug: "888888", count: 1, volume: 2, ods: "OUTROS", os: "OUTROS", priorityScore: 13 },
			],
			totalFinancialImpact: 1183,
		})
	})

	it("corta o Pareto em no mínimo 3 e no máximo 10 UGs", () => {
		const one = performAdvancedAnalysis({ "120001": { "11199": regs(1) } })
		expect(one.paretoData).toEqual({
			ugPercentage: 100,
			inconsistencyPercentage: 100,
			topUgs: [{ ug: "120001", count: 1, volume: 1, ods: "GABAER", os: "GABAER" }],
		})

		const many: GroupedData = {}
		for (let i = 0; i < 12; i++) many[String(900000 + i)] = { "11199": regs(1) }
		const result = performAdvancedAnalysis(many)
		// 80% de 12 = 9,6 → 10ª UG; o recorte para em 10.
		expect(result.paretoData.ugPercentage).toBe(83)
		expect(result.paretoData.topUgs).toHaveLength(10)
		expect(result.paretoData.inconsistencyPercentage).toBe(83)
		expect(result.priorityList).toHaveLength(5)
	})

	it("UG dominante sozinha: o Pareto mostra 3 UGs mesmo com a 1ª já passando de 80%", () => {
		const result = performAdvancedAnalysis({
			"120001": { "11199": regs(...Array<number>(20).fill(1)) },
			"120004": { "11199": regs(1) },
			"120006": { "11199": regs(1) },
			"120005": { "11199": regs(1) },
		})
		expect(result.paretoData.ugPercentage).toBe(25)
		expect(result.paretoData.inconsistencyPercentage).toBe(96)
		expect(result.paretoData.topUgs.map((u) => u.ug)).toEqual(["120001", "120004", "120005"])
	})

	it("saldo líquido zero dá score NaN (divisão por volume máximo zero)", () => {
		const result = performAdvancedAnalysis({ "120001": { "11199": regs(5, -5) } })
		expect(result.priorityList[0].priorityScore).toBeNaN()
		expect(result.totalFinancialImpact).toBe(0)
	})

	it("sem nenhuma UG: N/A nos níveis críticos e percentuais NaN", () => {
		const result = performAdvancedAnalysis({})
		expect(result.paretoData.ugPercentage).toBeNaN()
		expect(result.paretoData.inconsistencyPercentage).toBeNaN()
		expect(result.paretoData.topUgs).toEqual([])
		expect(result.odsRiskMap).toEqual([])
		expect(result.criticalSummary).toEqual({ ods: "N/A", os: "N/A", ugCount: "N/A", ugVolume: "N/A" })
		expect(result.priorityList).toEqual([])
		expect(result.totalFinancialImpact).toBe(0)
	})
})
