/**
 * Unit — matemática pura do estoque: alocação FEFO e suficiência.
 */
import { allocateFefo, sortFefo, sufficiency } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"

const lot = (lotId: string, balance: number, expiryDate: string | null) => ({ lotId, balance, expiryDate })

describe("allocateFefo", () => {
	test("consome primeiro o lote que vence antes", () => {
		const result = allocateFefo([lot("b", 100, "2026-12-01"), lot("a", 100, "2026-08-01")], 30)
		expect(result.allocations).toEqual([{ lotId: "a", quantity: 30 }])
		expect(result.shortfall).toBe(0)
	})

	test("atravessa múltiplos lotes quando o primeiro não basta", () => {
		const result = allocateFefo([lot("a", 20, "2026-08-01"), lot("b", 100, "2026-12-01")], 30)
		expect(result.allocations).toEqual([
			{ lotId: "a", quantity: 20 },
			{ lotId: "b", quantity: 10 },
		])
	})

	test("lote sem validade sai por último", () => {
		const result = allocateFefo([lot("sem", 100, null), lot("com", 5, "2026-09-01")], 10)
		expect(result.allocations).toEqual([
			{ lotId: "com", quantity: 5 },
			{ lotId: "sem", quantity: 5 },
		])
	})

	test("estoque insuficiente reporta shortfall", () => {
		const result = allocateFefo([lot("a", 8, "2026-08-01")], 10)
		expect(result.allocations).toEqual([{ lotId: "a", quantity: 8 }])
		expect(result.shortfall).toBe(2)
	})

	test("lotes zerados/negativos são ignorados", () => {
		const result = allocateFefo([lot("zero", 0, "2026-01-01"), lot("neg", -5, "2026-01-02"), lot("ok", 10, "2026-03-01")], 4)
		expect(result.allocations).toEqual([{ lotId: "ok", quantity: 4 }])
	})

	test("quantidade não-positiva não aloca nada", () => {
		expect(allocateFefo([lot("a", 10, null)], 0)).toEqual({ allocations: [], shortfall: 0 })
		expect(allocateFefo([lot("a", 10, null)], -3)).toEqual({ allocations: [], shortfall: 0 })
	})
})

describe("sortFefo", () => {
	test("ordena por validade asc com nulls no fim, estável", () => {
		const sorted = sortFefo([{ expiryDate: null }, { expiryDate: "2026-09-01" }, { expiryDate: "2026-08-01" }])
		expect(sorted.map((l) => l.expiryDate)).toEqual(["2026-08-01", "2026-09-01", null])
	})
})

describe("sufficiency", () => {
	test("conta suficientes e lista faltantes", () => {
		const result = sufficiency([
			{ itemKey: "arroz", required: 10, available: 50 },
			{ itemKey: "feijao", required: 20, available: 5 },
		])
		expect(result.total).toBe(2)
		expect(result.sufficient).toBe(1)
		expect(result.missing[0]?.itemKey).toBe("feijao")
	})
})
