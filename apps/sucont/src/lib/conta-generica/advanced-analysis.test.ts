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

	it("o grupo do Pareto são as UGs até alcançar 80%, e as duas porcentagens são sobre ele", () => {
		const one = performAdvancedAnalysis({ "120001": { "11199": regs(1) } })
		expect(one.paretoData).toEqual({
			ugPercentage: 100,
			inconsistencyPercentage: 100,
			topUgs: [{ ug: "120001", count: 1, volume: 1, ods: "GABAER", os: "GABAER" }],
		})

		const many: GroupedData = {}
		for (let i = 0; i < 20; i++) many[String(900000 + i)] = { "11199": regs(1) }
		const result = performAdvancedAnalysis(many)
		// 80% de 20 = 16 → 16 UGs. O port cortava a lista em 10 e somava só as 10 (50%),
		// mas dizia 80% das UGs.
		expect(result.paretoData.ugPercentage).toBe(80)
		expect(result.paretoData.inconsistencyPercentage).toBe(80)
		expect(result.paretoData.topUgs).toHaveLength(16)
		expect(result.priorityList).toHaveLength(5)
	})

	it("UG dominante sozinha: o grupo é só ela, e a concentração é a dela", () => {
		const result = performAdvancedAnalysis({
			"120001": { "11199": regs(...Array<number>(20).fill(1)) },
			"120004": { "11199": regs(1) },
			"120006": { "11199": regs(1) },
			"120005": { "11199": regs(1) },
		})
		// 20 de 23 = 87%. O port dizia "25% das UGs concentram 96%": media 1 UG e somava 3.
		expect(result.paretoData.ugPercentage).toBe(25)
		expect(result.paretoData.inconsistencyPercentage).toBeCloseTo((20 / 23) * 100)
		expect(result.paretoData.topUgs.map((u) => u.ug)).toEqual(["120001"])
	})

	it("sem volume positivo, a metade do volume no score vale 0 em vez de NaN", () => {
		const result = performAdvancedAnalysis({ "120001": { "11199": regs(5, -5) }, "120004": { "11199": regs(-3) } })
		expect(result.priorityList.map((p) => [p.ug, p.priorityScore])).toEqual([
			["120001", 50],
			["120004", 25],
		])
		expect(result.totalFinancialImpact).toBe(-3)
	})

	it("sem nenhuma UG: N/A nos níveis críticos e percentuais zerados", () => {
		const result = performAdvancedAnalysis({})
		expect(result.paretoData.ugPercentage).toBe(0)
		expect(result.paretoData.inconsistencyPercentage).toBe(0)
		expect(result.paretoData.topUgs).toEqual([])
		expect(result.odsRiskMap).toEqual([])
		expect(result.criticalSummary).toEqual({ ods: "N/A", os: "N/A", ugCount: "N/A", ugVolume: "N/A" })
		expect(result.priorityList).toEqual([])
		expect(result.totalFinancialImpact).toBe(0)
	})
})
