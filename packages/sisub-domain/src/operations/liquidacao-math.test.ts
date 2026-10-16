import { describe, expect, test } from "bun:test"
import { competenciaFromDate, deductionFromRate, normalizeNsNumber, resolvePurchaseUnitId, suggestedLiquidacaoValue } from "./liquidacao-math.ts"

describe("suggestedLiquidacaoValue", () => {
	test("soma quantidade × custo, fechado em centavos", () => {
		expect(
			suggestedLiquidacaoValue([
				{ receivedQtyBase: 48, unitCost: 2.5 },
				{ receivedQtyBase: 10, unitCost: 1.99 },
			])
		).toBe(139.9)
	})

	test("item sem custo entra como zero e não derruba a soma", () => {
		// É a linha ainda não precificada. Travar aqui impediria liquidar o
		// recebimento inteiro por causa de uma.
		expect(
			suggestedLiquidacaoValue([
				{ receivedQtyBase: 48, unitCost: 2.5 },
				{ receivedQtyBase: 10, unitCost: null },
			])
		).toBe(120)
	})

	test("recebimento vazio vale zero", () => {
		expect(suggestedLiquidacaoValue([])).toBe(0)
	})

	test("valor não finito é ignorado em vez de virar NaN na NS", () => {
		expect(
			suggestedLiquidacaoValue([
				{ receivedQtyBase: Number.NaN, unitCost: 2.5 },
				{ receivedQtyBase: 4, unitCost: 2 },
			])
		).toBe(8)
	})

	test("arredonda para 2 casas, não trunca", () => {
		expect(suggestedLiquidacaoValue([{ receivedQtyBase: 3, unitCost: 3.335 }])).toBe(10.01)
	})
})

describe("competenciaFromDate", () => {
	test("competência é sempre o primeiro dia do mês", () => {
		expect(competenciaFromDate("2026-09-17")).toBe("2026-09-01")
		expect(competenciaFromDate("2026-01-01")).toBe("2026-01-01")
	})

	test("data fora do formato ISO lança em vez de produzir competência torta", () => {
		expect(() => competenciaFromDate("17/09/2026")).toThrow(/Data inválida/)
	})
})

describe("normalizeNsNumber", () => {
	test("sem espaço nas bordas e em caixa alta", () => {
		expect(normalizeNsNumber("  2026ns000123 ")).toBe("2026NS000123")
	})
})

describe("resolvePurchaseUnitId", () => {
	test("a unidade COMPRADORA vence — é ela que empenha e liquida", () => {
		// Inverter a precedência autorizaria contra a unidade errada: falha de
		// autorização, não de exibição.
		expect(resolvePurchaseUnitId({ unitId: 10, purchaseUnitId: 20 })).toBe(20)
	})

	test("sem unidade compradora, cai na própria unidade", () => {
		expect(resolvePurchaseUnitId({ unitId: 10, purchaseUnitId: null })).toBe(10)
	})

	test("cozinha ausente ou sem unidade nenhuma devolve null", () => {
		expect(resolvePurchaseUnitId(null)).toBeNull()
		expect(resolvePurchaseUnitId(undefined)).toBeNull()
		expect(resolvePurchaseUnitId({ unitId: null, purchaseUnitId: null })).toBeNull()
	})
})

describe("deductionFromRate", () => {
	test("alíquota que cai no meio-centavo sobe, como o saldo que confere a dedução", () => {
		// 1,15 × 50 = 57,4999… em binário: a tela sugeria 0,57
		expect(deductionFromRate(1.15, 50)).toBe(0.58)
		expect(deductionFromRate(4.35, 50)).toBe(2.18)
		expect(deductionFromRate(16.15, 50)).toBe(8.08)
		expect(deductionFromRate(1000, 1.5)).toBe(15)
	})
})
