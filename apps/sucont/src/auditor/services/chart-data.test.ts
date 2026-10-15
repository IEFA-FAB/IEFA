/**
 * Caracterização das derivações dos gráficos do auditor (extraídas de
 * components/Charts.tsx). Trava o comportamento de origem, inclusive as
 * esquisitices (o filtro `diff > 0` que some com o item sem divergência, por exemplo).
 */

import { describe, expect, it } from "bun:test"
import { AccountGroup, type FinancialRecord, RiskLevel } from "../types"
import { aggregateComparisonData, buildTimeSeries, computeComparisonLayout, computeTotalNetDifference, paretoOpacity, resolveTooltipValues } from "./chart-data"
import { computeNetDifference, NET_DIFFERENCE_LABEL } from "./net-difference"

const rec = (partial: Partial<FinancialRecord>): FinancialRecord => ({
	id: "x",
	date: "01/2025",
	monthIndex: 0,
	year: 2025,
	sortableDate: "2025-01",
	cod: "000001",
	ug: "UG-A",
	orgaoSuperior: "ORG-1",
	ods: "ODS-1",
	group: AccountGroup.BMP,
	siafiValue: 0,
	silomsValue: 0,
	difference: 0,
	preponderance: "EQUAL",
	...partial,
})

const monthRec = (year: number, monthIndex: number, partial: Partial<FinancialRecord> = {}) =>
	rec({
		date: `${String(monthIndex + 1).padStart(2, "0")}/${year}`,
		year,
		monthIndex,
		...partial,
	})

describe("aggregateComparisonData", () => {
	it("devolve vazio quando não há dado", () => {
		expect(aggregateComparisonData(undefined as unknown as FinancialRecord[], ["TODOS"], "UG")).toEqual({
			aggregated: [],
			paretoData: [],
			totalAbsDiff: 0,
		})
	})

	it("agrega por UG somando os três grupos e calcula o Pareto", () => {
		const data = [
			rec({ ug: "UG-A", group: AccountGroup.BMP, siafiValue: 100, silomsValue: 60, difference: 40, riskLevel: RiskLevel.ALTO }),
			rec({ ug: "UG-A", group: AccountGroup.CONSUMO, siafiValue: 10, silomsValue: 30, difference: 20 }),
			rec({ ug: "UG-A", group: AccountGroup.INTANGIVEL, siafiValue: 5, silomsValue: 0, difference: 5 }),
			rec({ ug: "UG-B", group: AccountGroup.CONSUMO, siafiValue: 200, silomsValue: 100, difference: 100 }),
			rec({ ug: "UG-C", group: AccountGroup.INTANGIVEL, siafiValue: 0, silomsValue: 15, difference: 15 }),
			rec({ ug: "UG-C", group: AccountGroup.BMP, siafiValue: 1, silomsValue: 1, difference: 0 }),
			rec({ ug: "UG-D", group: AccountGroup.BMP, siafiValue: 3, silomsValue: 3, difference: 0 }),
		]
		const result = aggregateComparisonData(data, ["TODOS"], "UG")

		expect(result.totalAbsDiff).toBe(180)
		expect(result.aggregated.map((i) => i.name)).toEqual(["UG-B", "UG-A", "UG-C"])
		expect(result.aggregated[1]).toEqual({
			name: "UG-A",
			ug: "UG-A",
			siafi: 115,
			siloms: 90,
			diff: 65,
			orgaoSuperior: "ORG-1",
			ods: "ODS-1",
			riskLevel: RiskLevel.ALTO,
			bmpDiff: 40,
			consumoDiff: 20,
			intangivelDiff: 5,
		})
		expect(result.aggregated[0]).toMatchObject({ bmpDiff: 0, consumoDiff: 100, intangivelDiff: 0 })
		expect(result.aggregated[2]).toMatchObject({ bmpDiff: 0, consumoDiff: 0, intangivelDiff: 15, diff: 15 })
		// Mesmo sentido da Nota Analítica: SIAFI − SILOMS.
		expect(computeTotalNetDifference(result.aggregated)).toBe(115 + 200 + 0 - (90 + 100 + 15))
		expect(result.paretoData.map((p) => [p.name, p.totalAbsDiffContext, p.accumulatedPct])).toEqual([
			["UG-B", 180, (100 / 180) * 100],
			["UG-A", 180, (165 / 180) * 100],
			["UG-C", 180, 100],
		])
	})

	it("saldo NaN entra como 0 nas colunas, na criação e na soma, e o líquido segue SIAFI − SILOMS", () => {
		const first = aggregateComparisonData([rec({ ug: "UG-A", siafiValue: Number.NaN, silomsValue: Number.NaN, difference: 10 })], ["TODOS"], "UG")
		expect(first.aggregated[0]).toMatchObject({ siafi: 0, siloms: 0, diff: 10 })

		const merged = aggregateComparisonData(
			[
				rec({ ug: "UG-A", siafiValue: 10, silomsValue: 5, difference: 5 }),
				rec({ ug: "UG-A", group: AccountGroup.CONSUMO, siafiValue: Number.NaN, silomsValue: Number.NaN, difference: Number.NaN }),
			],
			["TODOS"],
			"UG"
		)
		expect(merged.aggregated[0]).toMatchObject({ siafi: 10, siloms: 5, diff: 5, consumoDiff: 0 })
		expect(computeTotalNetDifference(merged.aggregated)).toBe(5)

		// Só um lado ausente: o líquido é o do lado presente, nos dois caminhos.
		const oneSide = aggregateComparisonData(
			[
				rec({ ug: "UG-A", siafiValue: Number.NaN, silomsValue: 7, difference: 7 }),
				rec({ ug: "UG-A", group: AccountGroup.CONSUMO, siafiValue: 3, silomsValue: Number.NaN, difference: 3 }),
			],
			["TODOS"],
			"UG"
		)
		expect(oneSide.aggregated[0]).toMatchObject({ siafi: 3, siloms: 7 })
		expect(computeTotalNetDifference(oneSide.aggregated)).toBe(-4)
	})

	it("difference NaN entra como 0 no grupo ao criar o item", () => {
		// O segundo registro de cada UG, de outro grupo, mantém o item acima do filtro `diff > 0`.
		const r = aggregateComparisonData(
			[
				rec({ ug: "A", group: AccountGroup.BMP, difference: Number.NaN }),
				rec({ ug: "A", group: AccountGroup.CONSUMO, difference: 1 }),
				rec({ ug: "B", group: AccountGroup.CONSUMO, difference: Number.NaN }),
				rec({ ug: "B", group: AccountGroup.INTANGIVEL, difference: 2 }),
				rec({ ug: "C", group: AccountGroup.INTANGIVEL, difference: Number.NaN }),
				rec({ ug: "C", group: AccountGroup.BMP, difference: 3 }),
			],
			["TODOS"],
			"UG"
		)
		const byUg = Object.fromEntries(r.aggregated.map((i) => [i.name, [i.bmpDiff, i.consumoDiff, i.intangivelDiff, i.diff]]))
		expect(byUg).toEqual({ A: [0, 1, 0, 1], B: [0, 0, 2, 2], C: [3, 0, 0, 3] })
	})

	it("item só com difference NaN fica com diff 0 e sai pelo filtro `diff > 0`", () => {
		const r = aggregateComparisonData(
			[
				rec({ ug: "A", group: AccountGroup.BMP, difference: Number.NaN }),
				rec({ ug: "B", group: AccountGroup.CONSUMO, difference: Number.NaN }),
				rec({ ug: "C", group: AccountGroup.INTANGIVEL, difference: Number.NaN }),
			],
			["TODOS"],
			"UG"
		)
		expect(r.aggregated).toEqual([])
	})

	it("agrupa por ODS e por órgão", () => {
		const data = [
			rec({ ug: "UG-A", ods: "SEFA", orgaoSuperior: "O1", difference: 1 }),
			rec({ ug: "UG-B", ods: "SEFA", orgaoSuperior: "O2", difference: 2 }),
			rec({ ug: "UG-C", ods: "DCTA", orgaoSuperior: "O2", difference: 4 }),
		]
		const byOds = aggregateComparisonData(data, ["TODOS"], "ODS")
		expect(byOds.aggregated.map((i) => [i.name, i.ug, i.diff])).toEqual([
			["DCTA", "UG-C", 4],
			["SEFA", "UG-A", 3],
		])
		const byOrgao = aggregateComparisonData(data, ["TODOS"], "ORGAO")
		expect(byOrgao.aggregated.map((i) => [i.name, i.diff])).toEqual([
			["O2", 6],
			["O1", 1],
		])
	})

	it("unidade específica selecionada força a chave por UG", () => {
		const data = [rec({ ug: "UG-A", ods: "SEFA", difference: 1 }), rec({ ug: "UG-B", ods: "SEFA", difference: 2 })]
		expect(aggregateComparisonData(data, ["SEFA"], "ODS").aggregated.map((i) => i.name)).toEqual(["UG-B", "UG-A"])
		// Dois itens no filtro ou filtro ausente não contam como unidade específica.
		expect(aggregateComparisonData(data, ["SEFA", "DCTA"], "ODS").aggregated.map((i) => i.name)).toEqual(["SEFA"])
		expect(aggregateComparisonData(data, undefined as unknown as string[], "ODS").aggregated.map((i) => i.name)).toEqual(["SEFA"])
	})

	it("nível desconhecido cai na chave por UG", () => {
		const data = [rec({ ug: "UG-A", difference: 1 })]
		expect(aggregateComparisonData(data, ["TODOS"], "OUTRO" as "UG").aggregated.map((i) => i.name)).toEqual(["UG-A"])
	})
})

describe("buildTimeSeries", () => {
	it("saldo NaN conta 0 na soma por competência, como no comparativo", () => {
		const series = buildTimeSeries(
			[
				monthRec(2025, 0, { siafiValue: 10, silomsValue: 4, difference: 6 }),
				monthRec(2025, 0, { group: AccountGroup.CONSUMO, siafiValue: Number.NaN, silomsValue: Number.NaN, difference: Number.NaN }),
				monthRec(2025, 1, { siafiValue: Number.NaN, silomsValue: 2, difference: 2 }),
			],
			"MENSAL",
			"total",
			undefined
		)
		expect(series.map((s) => [s.totalSiafi, s.totalSiloms, s.totalDiff])).toEqual([
			[10, 4, 6],
			[0, 2, 2],
		])
	})

	it("devolve vazio sem dado", () => {
		expect(buildTimeSeries(undefined as unknown as FinancialRecord[], "MENSAL", "total", undefined)).toEqual([])
		expect(buildTimeSeries([], "TRIMESTRAL", "total", undefined)).toEqual([])
	})

	it("soma por competência, ordena e deriva ICC e ano anterior (mensal)", () => {
		const data = [
			monthRec(2025, 1, { siafiValue: 100, silomsValue: 80, difference: 20 }),
			monthRec(2024, 1, { siafiValue: 0, silomsValue: 0, difference: 0 }),
			monthRec(2025, 1, { siafiValue: 100, silomsValue: 100, difference: 0 }),
			monthRec(2024, 2, { siafiValue: 0, silomsValue: 5, difference: 5 }),
			monthRec(2025, 0, { siafiValue: 10, silomsValue: 20, difference: -10 }),
			monthRec(2025, 2, { siafiValue: 10, silomsValue: 30, difference: 20 }),
		]
		const series = buildTimeSeries(data, "MENSAL", "total", undefined)
		expect(series.map((s) => s.date)).toEqual(["02/2024", "03/2024", "01/2025", "02/2025", "03/2025"])
		expect(series.map((s) => s.icc)).toEqual([100, 0, 100, 90, 0])
		expect(series[3]).toEqual({
			date: "02/2025",
			year: 2025,
			monthIndex: 1,
			totalDiff: 20,
			totalSiafi: 200,
			totalSiloms: 180,
			timestamp: 202501,
			axisLabel: "FEV/25",
			icc: 90,
			diffHighlight: 20,
			prevYearDiff: 0,
			prevYearLabel: "FEV/24",
			currentYearLabel: "FEV/25",
		})
		expect(series[4]).toMatchObject({ prevYearDiff: 5, prevYearLabel: "MAR/24" })
		expect(series[2]).toMatchObject({ prevYearDiff: 0, prevYearLabel: "N/A", diffHighlight: 10 })
	})

	const yearOfMonths = () => Array.from({ length: 13 }, (_, i) => monthRec(2024 + Math.floor(i / 12), i % 12, { siafiValue: 10, difference: 1 }))

	it("trimestral, semestral e anual ancoram na última competência", () => {
		expect(buildTimeSeries(yearOfMonths(), "TRIMESTRAL", "total", undefined).map((s) => s.axisLabel)).toEqual([
			"JAN/24",
			"ABR/24",
			"JUL/24",
			"OUT/24",
			"JAN/25",
		])
		expect(buildTimeSeries(yearOfMonths(), "SEMESTRAL", "overlap", "TODOS").map((s) => s.axisLabel)).toEqual(["JAN/24", "JUL/24", "JAN/25"])
		expect(buildTimeSeries(yearOfMonths(), "ANUAL", "icc", undefined).map((s) => s.axisLabel)).toEqual(["JAN/24", "JAN/25"])
	})

	it("competência selecionada vira a âncora; não encontrada cai na última", () => {
		expect(buildTimeSeries(yearOfMonths(), "TRIMESTRAL", "total", "08/2024").map((s) => s.axisLabel)).toEqual(["FEV/24", "MAI/24", "AGO/24"])
		expect(buildTimeSeries(yearOfMonths(), "TRIMESTRAL", "total", "08/2030").map((s) => s.axisLabel)).toHaveLength(5)
	})

	it("comparativo anual ignora o filtro de escopo", () => {
		expect(buildTimeSeries(yearOfMonths(), "TRIMESTRAL", "comparison", undefined)).toHaveLength(13)
	})
})

describe("resolveTooltipValues", () => {
	it("lê as chaves do Pareto (diff/siafi/siloms) e o nome", () => {
		expect(resolveTooltipValues({ diff: 5, siafi: 200, siloms: 150, name: "UG-A", accumulatedPct: 50, icc: 90 }, "rótulo")).toEqual({
			diff: 5,
			siafi: 200,
			siloms: 150,
			pct: 50,
			icc: 90,
			pctDiff: 25,
			displayName: "UG-A",
		})
	})

	it("cai nas chaves da série temporal (total*) e depois nas do registro", () => {
		expect(resolveTooltipValues({ totalDiff: 1, totalSiafi: 10, totalSiloms: 20, name: "N/A", ug: "UG-B" }, "x")).toMatchObject({
			diff: 1,
			siafi: 10,
			siloms: 20,
			pctDiff: 100,
			displayName: "UG-B",
		})
		expect(resolveTooltipValues({ difference: 2, siafiValue: 0, silomsValue: 4, ug: "N/A" }, "JAN/25")).toMatchObject({
			diff: 2,
			siafi: 0,
			siloms: 4,
			pctDiff: 0,
			displayName: "JAN/25",
		})
	})

	it("sem valores: undefined preservado e percentual zero", () => {
		expect(resolveTooltipValues({}, undefined)).toEqual({
			diff: undefined,
			siafi: undefined,
			siloms: undefined,
			pct: undefined,
			icc: undefined,
			pctDiff: 0,
			displayName: undefined,
		})
	})
})

describe("paretoOpacity", () => {
	it("cheia até 80% do acumulado, apagada depois e sem acumulado", () => {
		expect(paretoOpacity(undefined)).toBe(0.4)
		expect(paretoOpacity({})).toBe(0.4)
		expect(paretoOpacity({ accumulatedPct: 0 })).toBe(0.4)
		expect(paretoOpacity({ accumulatedPct: 50 })).toBe(1)
		expect(paretoOpacity({ accumulatedPct: 80 })).toBe(1)
		expect(paretoOpacity({ accumulatedPct: 80.01 })).toBe(0.4)
	})
})

describe("computeComparisonLayout", () => {
	const rows = Array.from({ length: 30 }, (_, i) => ({ name: `UG-${i}`, accumulatedPct: (i + 1) * 3.4 }))

	it("compacto: conta barras pela largura medida (6 a 20; 20 antes de medir)", () => {
		expect(computeComparisonLayout(rows, 0, false, "ranking").displayData).toHaveLength(20)
		expect(computeComparisonLayout(rows, 100, false, "ranking").displayData).toHaveLength(6)
		expect(computeComparisonLayout(rows, 590, false, "ranking").displayData).toHaveLength(10)
		expect(computeComparisonLayout(rows, 5000, false, "ranking").displayData).toHaveLength(20)
	})

	it("compacto: contêiner fluido, sem rolagem, eixo e barras padrão", () => {
		const layout = computeComparisonLayout(rows, 0, undefined, "tree")
		expect(layout.containerStyle).toEqual({ width: "100%", height: "100%" })
		expect(layout.overflowClass).toBe("")
		expect(layout.axisHeight).toBe(84)
		expect(layout.compositionBarSize).toBeUndefined()
		expect(layout.paretoBarSize).toBeUndefined()
	})

	it("expandido: série inteira, rolagem e eixo maior", () => {
		const ranking = computeComparisonLayout(rows, 300, true, "ranking")
		expect(ranking.displayData).toHaveLength(30)
		expect(ranking.containerStyle).toEqual({ width: "100%", height: "100%", minWidth: "3000px" })
		expect(ranking.overflowClass).toBe("overflow-x-auto custom-scrollbar pb-2")
		expect(ranking.axisHeight).toBe(110)
		expect(ranking.compositionBarSize).toBe(30)
		expect(ranking.paretoBarSize).toBe(40)

		expect(computeComparisonLayout(rows.slice(0, 3), 0, true, "composition").containerStyle).toEqual({
			width: "100%",
			height: "100%",
			minWidth: "1200px",
		})

		const tree = computeComparisonLayout(rows, 0, true, "tree")
		expect(tree.containerStyle).toEqual({ width: "2400px", height: "1600px" })
		expect(tree.overflowClass).toBe("flex-1 overflow-auto custom-scrollbar")
	})

	it("linhas do Pareto ganham `fillOpacity` sem alterar `displayData`", () => {
		const layout = computeComparisonLayout(rows, 0, false, "ranking")
		expect(layout.paretoRows[0]).toEqual({ ...rows[0], fillOpacity: 1 })
		expect(layout.paretoRows[19].fillOpacity).toBe(1)
		expect(layout.displayData[0]).not.toHaveProperty("fillOpacity")
		expect(computeComparisonLayout([{ accumulatedPct: 90 }], 0, false, "ranking").paretoRows[0].fillOpacity).toBe(0.4)
	})
})

describe("diferença líquida — um sentido só para gráfico e nota", () => {
	it("é SIAFI − SILOMS e o rótulo diz o sentido", () => {
		expect(computeNetDifference(100, 60)).toBe(40)
		expect(computeNetDifference(60, 100)).toBe(-40)
		expect(NET_DIFFERENCE_LABEL).toBe("Diferença líquida (SIAFI − SILOMS)")
	})

	it("conjunto vazio dá 0", () => {
		expect(computeTotalNetDifference([])).toBe(0)
	})
})
