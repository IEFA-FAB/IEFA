import { describe, expect, it } from "bun:test"
import { computeDerivedStats } from "#/lib/conta-generica/derived-stats"
import type { GroupedData } from "#/lib/conta-generica/helpers"

const regs = (...saldos: number[]) => saldos.map((saldo, i) => ({ mes: `M${i}`, saldo }))

describe("computeDerivedStats", () => {
	it("sem resultado: tudo zerado e a questão RAC 29 presente com contagem zero", () => {
		expect(computeDerivedStats(null)).toEqual({
			totalUGs: 0,
			totalContas: 0,
			totalSaldoGeral: 0,
			totalInconsistencias: 0,
			conferenteStats: {},
			racStatsMap: { "29": { count: 0, volume: 0, ugs: new Set() } },
			topContasByFreq: [],
			topUgsByCount: [],
			topOdsByCount: [],
			topOsByCount: [],
		})
	})

	it("conta totais, conferentes, RAC, ODS, OS, UGs e contas", () => {
		// 120001 GABAER (1S ELIANA) · 120004 BABR (1S ELIANA, COMPREP/VI COMAR) ·
		// 120006 GAP-BR (1T JEFFERSON LUÍS, SEFA/DIRAD) · 120017 II COMAR (sem conferente) ·
		// 888888 fora do cadastro.
		const result: GroupedData = {
			"120001": { "11199": regs(100, 50), A99: regs(7) },
			"120004": { "11199": regs(1000) },
			"120006": { "21299": regs(5, 5, 5) },
			"120017": { "09999": regs(-2) },
			"888888": { "21299": regs(1) },
		}
		expect(computeDerivedStats(result)).toEqual({
			totalUGs: 5,
			totalContas: 6,
			totalSaldoGeral: 1171,
			totalInconsistencias: 9,
			conferenteStats: {
				"1S ELIANA": { ugs: ["120001", "120004"], count: 4 },
				"1T JEFFERSON LUÍS": { ugs: ["120006"], count: 3 },
				"NÃO MAPEADO": { ugs: ["120017", "888888"], count: 2 },
			},
			// "A99" e "09999" não começam por dígito de 1 a 9: caem na questão XX, que não é contada.
			racStatsMap: { "29": { count: 7, volume: 1166, ugs: new Set(["120001", "120004", "120006", "888888"]) } },
			topContasByFreq: [
				{ conta: "21299", count: 4, volume: 16 },
				{ conta: "11199", count: 3, volume: 1150 },
				{ conta: "A99", count: 1, volume: 7 },
				{ conta: "09999", count: 1, volume: -2 },
			],
			topUgsByCount: [
				{ ug: "120001", count: 3, volume: 157 },
				{ ug: "120006", count: 3, volume: 15 },
				{ ug: "120004", count: 1, volume: 1000 },
				{ ug: "120017", count: 1, volume: -2 },
				{ ug: "888888", count: 1, volume: 1 },
			],
			topOdsByCount: [
				{ ods: "GABAER", count: 3, volume: 157, ugs: new Set(["120001"]) },
				{ ods: "SEFA", count: 3, volume: 15, ugs: new Set(["120006"]) },
				{ ods: "COMPREP", count: 2, volume: 998, ugs: new Set(["120004", "120017"]) },
				{ ods: "OUTROS", count: 1, volume: 1, ugs: new Set(["888888"]) },
			],
			topOsByCount: [
				{ os: "GABAER", count: 3, volume: 157, ugs: new Set(["120001"]) },
				{ os: "DIRAD", count: 3, volume: 15, ugs: new Set(["120006"]) },
				{ os: "VI COMAR", count: 1, volume: 1000, ugs: new Set(["120004"]) },
				{ os: "COMPREP", count: 1, volume: -2, ugs: new Set(["120017"]) },
				{ os: "OUTROS", count: 1, volume: 1, ugs: new Set(["888888"]) },
			],
		})
	})

	it("limita o ranking de contas e de UGs a 10", () => {
		const result: GroupedData = {}
		for (let i = 0; i < 12; i++) result[String(900000 + i)] = { [`1${i}99`]: regs(1) }
		const stats = computeDerivedStats(result)
		expect(stats.totalUGs).toBe(12)
		expect(stats.topContasByFreq).toHaveLength(10)
		expect(stats.topUgsByCount).toHaveLength(10)
	})
})
