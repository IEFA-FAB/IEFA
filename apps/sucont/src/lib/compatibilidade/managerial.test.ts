import { describe, expect, it } from "bun:test"
import { buildManagerialData } from "./managerial"
import { PAIR_COLORS, PAIRS, type UGReport } from "./parser"

function report(ug: string, conferente: string, superior: string, ods: string, pairs: [number, number][]): UGReport {
	return {
		ug,
		ugCode: ug,
		ugName: ug,
		superior,
		ods,
		conferente,
		totalDiff: pairs.reduce((acc, [, diff]) => acc + Math.abs(diff), 0),
		divergencias: [],
		chartData: [],
		pairs: pairs.map(([id, diff]) => ({ ...PAIRS[id - 1], saldoA: undefined, saldoB: undefined, diff, hasA: false, hasB: false })),
	}
}

describe("buildManagerialData", () => {
	it("sem relatórios devolve null", () => {
		expect(buildManagerialData([])).toBeNull()
	})

	it("agrega por par, conferente, órgão superior e ODS", () => {
		const data = buildManagerialData([
			report("120001 - GABAER", "1S ELIANA", "GABAER", "GABAER", [[1, 100]]),
			report("120002", "1S ELIANA", "SEFA", "SEFA", [
				[2, -40],
				[3, 10],
			]),
			report("120006", "1T JEFFERSON LUÍS", "DIRAD", "SEFA", [[2, 5]]),
			// par fora da lista (id desconhecido) não entra em nenhuma fatia
			{
				...report("120007", "1T ÉRIKA VICENTE", "DIRAD", "SEFA", []),
				totalDiff: 1,
				pairs: [{ ...PAIRS[0], id: 99, saldoA: 0, saldoB: 0, diff: 7, hasA: true, hasB: true }],
			},
		])

		expect(data).toEqual({
			totalVolume: 156,
			pairStats: [
				{ name: "Par 1", description: "1.1.1.1.1.19.03 × 8.1.1.1.1.01.13", count: 1, volume: 100, color: PAIR_COLORS[0], fill: PAIR_COLORS[0] },
				{ name: "Par 2", description: "1.1.5.5.1.10.00 × 8.9.9.9.2.01.02", count: 2, volume: -35, color: PAIR_COLORS[1], fill: PAIR_COLORS[1] },
				{ name: "Par 3", description: "1.2.3.1.1.99.05 × 8.9.9.9.2.02.02", count: 1, volume: 10, color: PAIR_COLORS[2], fill: PAIR_COLORS[2] },
			],
			topUGs: [
				{ name: "GABAER (120001)", volume: 100, conferente: "1S ELIANA" },
				{ name: "120002", volume: 50, conferente: "1S ELIANA" },
				{ name: "120006", volume: 5, conferente: "1T JEFFERSON LUÍS" },
				{ name: "120007", volume: 1, conferente: "1T ÉRIKA VICENTE" },
			],
			conferenteStats: [
				{ name: "1S ELIANA", count: 2, volume: 150, ugs: ["120001 - GABAER", "120002"] },
				{ name: "1T JEFFERSON LUÍS", count: 1, volume: 5, ugs: ["120006"] },
				{ name: "1T ÉRIKA VICENTE", count: 1, volume: 1, ugs: ["120007"] },
			],
			superiorStats: [
				{ name: "DIRAD", count: 2, volume: 6, ugs: ["120006", "120007"] },
				{ name: "GABAER", count: 1, volume: 100, ugs: ["120001 - GABAER"] },
				{ name: "SEFA", count: 1, volume: 50, ugs: ["120002"] },
			],
			odsStats: [
				{ name: "SEFA", count: 3, volume: 56, ugs: ["120002", "120006", "120007"] },
				{ name: "GABAER", count: 1, volume: 100, ugs: ["120001 - GABAER"] },
			],
		})
	})

	it("top 5 corta em cinco, pela diferença total decrescente", () => {
		const reports = [1, 2, 3, 4, 5, 6].map((n) => report(`U${n}`, "C", "S", "O", [[1, n]]))
		expect(buildManagerialData(reports)?.topUGs.map((u) => u.name)).toEqual(["U6", "U5", "U4", "U3", "U2"])
	})
})
