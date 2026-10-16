/**
 * Caracterização das tabelas e rótulos da Nota Analítica (extraídos de
 * components/AnalyticNoteModal.tsx). As células são as mesmas strings que a
 * tela imprimia; `formatCurrency` não está sob teste aqui.
 */

import { describe, expect, it } from "bun:test"
import {
	buildGroupRows,
	buildInterOmRows,
	buildOffenderRows,
	buildPreviewRows,
	buildSummaryRows,
	buildTrendRows,
	describeTimeFilter,
	GROUP_LABEL,
	groupLabel,
	percent,
	preponderanceLabel,
	SCOPE_LABEL,
} from "./analytic-note-view"
import { formatCurrency as brl } from "./dataProcessor"
import type { ReportDataset } from "./report"

const totals = { siafi: 1000, siloms: 800, absoluteDifference: 250, netDifference: -200 }

const dataset = (overrides: Partial<ReportDataset> = {}): ReportDataset => ({
	competence: "2025-07",
	competenceLabel: "JUL/25",
	timeFilter: "MENSAL",
	scopeLabel: "todas as UGs",
	periodsLoaded: 3,
	ugCount: 12,
	recordCount: 30,
	totals,
	previous: { period: "2025-06", label: "JUN/25", totals: { ...totals, absoluteDifference: 99 } },
	preponderance: { siafi: 5, siloms: 4, equal: 3 },
	groups: [],
	topOffenders: [],
	trends: [],
	interOm: [],
	...overrides,
})

describe("rótulos", () => {
	it("grupo conhecido traduz; desconhecido sai cru", () => {
		expect(GROUP_LABEL).toEqual({ BMP: "Bens Móveis Permanentes", CONSUMO: "Bens de Consumo", INTANGIVEL: "Bens Intangíveis" })
		expect(groupLabel("CONSUMO")).toBe("Bens de Consumo")
		expect(groupLabel("DIVERSOS")).toBe("DIVERSOS")
	})

	it("percentual com sinal, duas casas e travessão para null", () => {
		expect(percent(null)).toBe("—")
		expect(percent(12.345)).toBe("+12.35%")
		expect(percent(0)).toBe("0.00%")
		expect(percent(-3.1)).toBe("-3.10%")
	})

	it("escopo do cabeçalho: dicionário, cru ou undefined", () => {
		expect(SCOPE_LABEL).toEqual({ MENSAL: "Mensal", TRIMESTRAL: "Trimestral", SEMESTRAL: "Semestral", ANUAL: "Anual" })
		expect(describeTimeFilter("ANUAL")).toBe("Anual")
		expect(describeTimeFilter("BIENAL")).toBe("BIENAL")
		expect(describeTimeFilter(undefined)).toBeUndefined()
	})

	it("situação pela preponderância", () => {
		expect(preponderanceLabel("EQUAL")).toBe("Equilibrado")
		expect(preponderanceLabel("SIAFI")).toBe("SIAFI > SILOMS")
		expect(preponderanceLabel("SILOMS")).toBe("SILOMS > SIAFI")
	})
})

describe("buildPreviewRows", () => {
	it("com competência anterior", () => {
		expect(buildPreviewRows(dataset())).toEqual([
			["Competência", "JUL/25"],
			["Recorte", "todas as UGs"],
			["Unidades Gestoras", "12"],
			["Registros (UG × grupo)", "30"],
			["Divergência total", brl(250)],
			["Diferença líquida (SILOMS − SIAFI)", brl(-200)],
			["Competência anterior", "JUN/25"],
		])
	})

	it("sem competência anterior", () => {
		expect(buildPreviewRows(dataset({ previous: null }))[6]).toEqual(["Competência anterior", "não consta na base carregada"])
	})
})

describe("buildSummaryRows", () => {
	it("com competência anterior", () => {
		expect(buildSummaryRows(dataset())).toEqual([
			["Saldo total SIAFI", brl(1000)],
			["Saldo total SILOMS", brl(800)],
			["Divergência total (soma dos módulos)", brl(250)],
			["Diferença líquida (SILOMS − SIAFI)", brl(-200)],
			["Unidades Gestoras analisadas", "12"],
			["Preponderância", "SIAFI maior em 5 · SILOMS maior em 4 · equilibrados 3"],
			["Competência anterior (JUN/25)", brl(99)],
		])
	})

	it("sem competência anterior", () => {
		expect(buildSummaryRows(dataset({ previous: null }))[6]).toEqual(["Competência anterior (—)", "não consta na base carregada"])
	})
})

describe("tabelas por linha", () => {
	it("maiores divergências, com e sem risco", () => {
		expect(
			buildOffenderRows([
				{ ug: "BAAN", cod: "120001", group: "BMP", siafi: 10, siloms: 4, difference: 6, preponderance: "SIAFI", riskLevel: "Crítico" },
				{ ug: "BASM", cod: "120002", group: "OUTRO", siafi: 1, siloms: 1, difference: 0, preponderance: "EQUAL" },
				{ ug: "BACO", cod: "120003", group: "INTANGIVEL", siafi: 0, siloms: 2, difference: 2, preponderance: "SILOMS" },
			])
		).toEqual([
			["BAAN", "120001", "Bens Móveis Permanentes", brl(6), brl(10), brl(4), "SIAFI > SILOMS", "Crítico"],
			["BASM", "120002", "OUTRO", brl(0), brl(1), brl(1), "Equilibrado", "—"],
			["BACO", "120003", "Bens Intangíveis", brl(2), brl(0), brl(2), "SILOMS > SIAFI", "—"],
		])
		expect(buildOffenderRows([])).toEqual([])
	})

	it("transferências entre OMs", () => {
		expect(
			buildInterOmRows([
				{ date: "2025-07", ugA: "BAAN", codA: "1", ugB: "BASM", codB: "2", group: "DIVERSOS", deltaA: 10, deltaB: -10, value: 10, residual: 0.5 },
			] as ReportDataset["interOm"])
		).toEqual([["BAAN (1)", "BASM (2)", "DIVERSOS", brl(10), brl(0.5)]])
	})

	it("tendência: variação com percentual ou travessão", () => {
		expect(
			buildTrendRows([
				{ ug: "BAAN", cod: "1", group: "CONSUMO", delta: 5, deltaPct: 50, difference: 15, previousDifference: 10, previousDate: "2025-06" },
				{ ug: "BASM", cod: "2", group: "BMP", delta: -3, deltaPct: null, difference: 0, previousDifference: 3, previousDate: "2025-06" },
			])
		).toEqual([
			["BAAN", "1", "Bens de Consumo", brl(5), "+50.00%", brl(15), brl(10)],
			["BASM", "2", "Bens Móveis Permanentes", brl(-3), "—", brl(0), brl(3)],
		])
	})

	it("gargalos por grupo", () => {
		expect(buildGroupRows([{ group: "CONSUMO", siafi: 3, siloms: 1, difference: 2, ugCount: 7 }])).toEqual([["Bens de Consumo", brl(2), brl(3), brl(1), "7"]])
	})
})
