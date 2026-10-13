/**
 * Caracterização das derivações do painel do auditor (extraídas dos useMemo de
 * routes/auditor.tsx): filtro base, período anterior, KPIs, série dos mini
 * gráficos e rótulos.
 */

import { describe, expect, it } from "bun:test"
import { AccountGroup, type FinancialRecord, RiskLevel } from "../types"
import {
	buildComparisonLabel,
	buildHierarchyLabel,
	buildHierarchyOptions,
	computeKpiStats,
	computeTrendSeries,
	filterBaseData,
	getPeriodGap,
	selectPreviousKpiData,
} from "./dashboard"

const rec = (over: Partial<FinancialRecord> = {}): FinancialRecord => ({
	id: "id",
	date: "2024-01",
	monthIndex: 0,
	year: 2024,
	sortableDate: "2024-01",
	cod: "120001",
	ug: "ALFA",
	orgaoSuperior: "COMGAP",
	ods: "ODS-1",
	group: AccountGroup.BMP,
	siafiValue: 100,
	silomsValue: 90,
	difference: 10,
	preponderance: "SIAFI",
	...over,
})

const ALL = { searchTerm: "", selectedRisk: "TODOS", selectedHierarchyLevel: "UG" as const, selectedHierarchyFilter: ["TODOS"] }

describe("filterBaseData", () => {
	const data = [
		rec({ ug: "Alfa", cod: "111111", ods: "O1", orgaoSuperior: "G1", riskLevel: RiskLevel.ALTO }),
		rec({ ug: "BRAVO", cod: "222222", ods: "O2", orgaoSuperior: "G2", riskLevel: RiskLevel.BAIXO }),
	]
	const ugs = (r: FinancialRecord[]) => r.map((x) => x.ug)

	it("sem filtro devolve tudo", () => {
		expect(ugs(filterBaseData(data, ALL))).toEqual(["Alfa", "BRAVO"])
	})

	it("busca pelo nome da UG sem caixa, ou pelo código", () => {
		expect(ugs(filterBaseData(data, { ...ALL, searchTerm: "ALF" }))).toEqual(["Alfa"])
		expect(ugs(filterBaseData(data, { ...ALL, searchTerm: "2222" }))).toEqual(["BRAVO"])
		expect(ugs(filterBaseData(data, { ...ALL, searchTerm: "bravo" }))).toEqual(["BRAVO"])
		expect(ugs(filterBaseData(data, { ...ALL, searchTerm: "XYZ" }))).toEqual([])
	})

	it("filtra por risco", () => {
		expect(ugs(filterBaseData(data, { ...ALL, selectedRisk: RiskLevel.BAIXO }))).toEqual(["BRAVO"])
	})

	it("filtra por ODS, órgão ou UG conforme o nível", () => {
		expect(ugs(filterBaseData(data, { ...ALL, selectedHierarchyLevel: "ODS", selectedHierarchyFilter: ["O2"] }))).toEqual(["BRAVO"])
		expect(ugs(filterBaseData(data, { ...ALL, selectedHierarchyLevel: "ORGAO", selectedHierarchyFilter: ["G1"] }))).toEqual(["Alfa"])
		expect(ugs(filterBaseData(data, { ...ALL, selectedHierarchyLevel: "UG", selectedHierarchyFilter: ["BRAVO", "Alfa"] }))).toEqual(["Alfa", "BRAVO"])
	})

	it("lista vazia ou com TODOS não filtra hierarquia", () => {
		expect(ugs(filterBaseData(data, { ...ALL, selectedHierarchyFilter: [] }))).toEqual(["Alfa", "BRAVO"])
		expect(ugs(filterBaseData(data, { ...ALL, selectedHierarchyFilter: ["O1", "TODOS"], selectedHierarchyLevel: "ODS" }))).toEqual(["Alfa", "BRAVO"])
	})
})

describe("getPeriodGap", () => {
	it("1, 3, 6 e 12 meses", () => {
		expect(getPeriodGap("MENSAL")).toBe(1)
		expect(getPeriodGap("TRIMESTRAL")).toBe(3)
		expect(getPeriodGap("SEMESTRAL")).toBe(6)
		expect(getPeriodGap("ANUAL")).toBe(12)
	})
})

describe("selectPreviousKpiData", () => {
	const data = [
		rec({ date: "2023-12", group: AccountGroup.BMP }),
		rec({ date: "2023-12", group: AccountGroup.CONSUMO }),
		rec({ date: "2023-10", group: AccountGroup.BMP }),
		rec({ date: "2023-07", group: AccountGroup.BMP }),
		rec({ date: "2023-01", group: AccountGroup.BMP }),
		rec({ date: "2024-01", group: AccountGroup.BMP }),
	]
	const months = ["2023-01", "2023-07", "2023-10", "2023-12", "2024-01"]
	const dates = (r: FinancialRecord[]) => r.map((x) => `${x.date}:${x.group}`)

	it("sem mês, com TODOS ou sem meses: vazio", () => {
		expect(selectPreviousKpiData(data, "", months, "ALL", "MENSAL")).toEqual([])
		expect(selectPreviousKpiData(data, "TODOS", months, "ALL", "MENSAL")).toEqual([])
		expect(selectPreviousKpiData(data, "2024-01", [], "ALL", "MENSAL")).toEqual([])
	})

	it("volta o passo do agrupamento atravessando o ano", () => {
		expect(dates(selectPreviousKpiData(data, "2024-01", months, "ALL", "MENSAL"))).toEqual(["2023-12:BMP", "2023-12:CONSUMO"])
		expect(dates(selectPreviousKpiData(data, "2024-01", months, "ALL", "TRIMESTRAL"))).toEqual(["2023-10:BMP"])
		expect(dates(selectPreviousKpiData(data, "2024-01", months, "ALL", "SEMESTRAL"))).toEqual(["2023-07:BMP"])
		expect(dates(selectPreviousKpiData(data, "2024-01", months, "ALL", "ANUAL"))).toEqual(["2023-01:BMP"])
	})

	it("respeita o grupo selecionado", () => {
		expect(dates(selectPreviousKpiData(data, "2024-01", months, AccountGroup.CONSUMO, "MENSAL"))).toEqual(["2023-12:CONSUMO"])
	})

	it("mês fora do formato YYYY-MM não acha período anterior", () => {
		expect(selectPreviousKpiData(data, "JANEIRO/2024", months, "ALL", "MENSAL")).toEqual([])
	})
})

describe("computeKpiStats", () => {
	it("totais, variação, maior divergência, ICC e UGs", () => {
		const kpi = [rec({ ug: "A", siafiValue: 100, silomsValue: 80, difference: 20 }), rec({ ug: "B", siafiValue: 300, silomsValue: 290, difference: 10 })]
		const prev = [rec({ siafiValue: 200, silomsValue: 200, difference: 15 })]
		const visuals = [kpi[1], kpi[0], rec({ ug: "A", difference: 20, siafiValue: 50 })]
		const stats = computeKpiStats(kpi, prev, visuals)
		expect(stats.totalDiff).toBe(30)
		expect(stats.totalSiafi).toBe(400)
		expect(stats.totalSiloms).toBe(370)
		expect(stats.diffVar).toBe(100)
		expect(stats.siafiVar).toBe(100)
		expect(stats.silomsVar).toBe(85)
		// Empate em `difference` fica com o último (`>` estrito).
		expect(stats.topOffender).toBe(visuals[2])
		expect(stats.topOffenderICC).toBe(60)
		expect(stats.totalUGsCount).toBe(2)
		expect(stats.healthScore).toBeCloseTo(92.5, 10)
	})

	it("período anterior zerado: 100% se cresceu, 0 se não", () => {
		const stats = computeKpiStats([rec({ difference: 5, siafiValue: 0, silomsValue: 0 })], [], [])
		expect(stats.diffVar).toBe(100)
		expect(stats.siafiVar).toBe(0)
		expect(stats.silomsVar).toBe(0)
	})

	it("sem registro no mês: sem maior divergência, ICC dela 0 e ICC geral 100", () => {
		const stats = computeKpiStats([], [], [])
		expect(stats.topOffender).toBeNull()
		expect(stats.topOffenderICC).toBe(0)
		expect(stats.healthScore).toBe(100)
		expect(stats.totalUGsCount).toBe(0)
	})

	it("sem saldo SIAFI: ICC 100 se não diverge, 0 se diverge", () => {
		const zero = rec({ siafiValue: 0, difference: 0 })
		expect(computeKpiStats([zero], [], [zero]).topOffenderICC).toBe(100)
		expect(computeKpiStats([zero], [], [zero]).healthScore).toBe(100)
		const diverge = rec({ siafiValue: 0, difference: 5 })
		expect(computeKpiStats([diverge], [], [diverge]).topOffenderICC).toBe(0)
		expect(computeKpiStats([diverge], [], [diverge]).healthScore).toBe(0)
	})

	it("ICC não fica negativo", () => {
		const big = rec({ siafiValue: 10, difference: 50 })
		const stats = computeKpiStats([big], [], [big])
		expect(stats.topOffenderICC).toBe(0)
		expect(stats.healthScore).toBe(0)
	})

	it("variação negativa", () => {
		const stats = computeKpiStats([rec({ difference: 5 })], [rec({ difference: 10 })], [])
		expect(stats.diffVar).toBe(-50)
	})
})

describe("computeTrendSeries", () => {
	const months = ["2023-01", "2023-02", "2023-03", "2023-04", "2023-05", "2023-06", "2023-07"]
	const data = months.flatMap((m, i) => [
		rec({ date: m, group: AccountGroup.BMP, difference: i, siafiValue: 10 * i, silomsValue: 100 * i }),
		rec({ date: m, group: AccountGroup.CONSUMO, difference: 1, siafiValue: 1, silomsValue: 1 }),
	])

	it("sem mês ou sem meses: séries vazias", () => {
		expect(computeTrendSeries(data, "", months, "ALL", "MENSAL")).toEqual({ diff: [], siafi: [], siloms: [] })
		expect(computeTrendSeries(data, "2023-07", [], "ALL", "MENSAL")).toEqual({ diff: [], siafi: [], siloms: [] })
	})

	it("seis últimos meses até o selecionado, no grupo", () => {
		expect(computeTrendSeries(data, "2023-07", months, AccountGroup.BMP, "MENSAL")).toEqual({
			diff: [1, 2, 3, 4, 5, 6],
			siafi: [10, 20, 30, 40, 50, 60],
			siloms: [100, 200, 300, 400, 500, 600],
		})
	})

	it("ALL soma os grupos; índice antes do início é descartado", () => {
		expect(computeTrendSeries(data, "2023-03", months, "ALL", "MENSAL").diff).toEqual([1, 2, 3])
	})

	it("passo do agrupamento", () => {
		expect(computeTrendSeries(data, "2023-07", months, AccountGroup.BMP, "TRIMESTRAL").diff).toEqual([0, 3, 6])
		expect(computeTrendSeries(data, "2023-07", months, AccountGroup.BMP, "SEMESTRAL").diff).toEqual([0, 6])
		expect(computeTrendSeries(data, "2023-07", months, AccountGroup.BMP, "ANUAL").diff).toEqual([6])
	})

	it("mês fora da lista (índice -1): séries vazias", () => {
		expect(computeTrendSeries(data, "2030-01", months, "ALL", "MENSAL")).toEqual({ diff: [], siafi: [], siloms: [] })
	})
})

describe("buildComparisonLabel", () => {
	it("sem mês ou sem dado: só o agrupamento", () => {
		expect(buildComparisonLabel([rec()], "", "TRIMESTRAL")).toBe("Comparando TRIMESTRAL")
		expect(buildComparisonLabel([], "2024-01", "MENSAL")).toBe("Comparando MENSAL")
	})

	it("mês curto do primeiro registro contra a competência anterior dele", () => {
		expect(buildComparisonLabel([rec({ year: 2025, monthIndex: 8, previousDate: "AGO/25" })], "2025-09", "MENSAL")).toBe("Comparando SET/25 contra AGO/25")
		expect(buildComparisonLabel([rec({ year: 2025, monthIndex: 11 })], "2025-12", "MENSAL")).toBe("Comparando DEZ/25 contra N/A")
		expect(buildComparisonLabel([rec({ year: 2025, monthIndex: 0, previousDate: "" })], "2025-01", "MENSAL")).toBe("Comparando JAN/25 contra N/A")
	})
})

describe("buildHierarchyLabel", () => {
	it("vazio ou TODOS: todas as UGs", () => {
		expect(buildHierarchyLabel([], "ODS")).toBe("todas as UGs")
		expect(buildHierarchyLabel(["X", "TODOS"], "UG")).toBe("todas as UGs")
	})

	it("nível e unidades", () => {
		expect(buildHierarchyLabel(["G1"], "ORGAO")).toBe("Órgão G1")
		expect(buildHierarchyLabel(["O1", "O2"], "ODS")).toBe("ODS O1, O2")
		expect(buildHierarchyLabel(["ALFA"], "UG")).toBe("UG ALFA")
	})
})

describe("buildHierarchyOptions", () => {
	const lists = { uniqueODS: ["O1"], uniqueOrgaos: ["G1", "G2"], uniqueUGs: ["ALFA"] }

	it("ODS", () => {
		expect(buildHierarchyOptions("ODS", lists)).toEqual([
			{ value: "TODOS", label: "Todas as ODSs" },
			{ value: "O1", label: "O1" },
		])
	})

	it("Órgão", () => {
		expect(buildHierarchyOptions("ORGAO", lists)).toEqual([
			{ value: "TODOS", label: "Todas as Órgãos" },
			{ value: "G1", label: "G1" },
			{ value: "G2", label: "G2" },
		])
	})

	it("UG", () => {
		expect(buildHierarchyOptions("UG", lists)).toEqual([
			{ value: "TODOS", label: "Todas as UGs" },
			{ value: "ALFA", label: "ALFA" },
		])
	})
})
