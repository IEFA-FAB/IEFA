/**
 * Contrato do arredondamento de dinheiro.
 *
 * Os casos de meio-centavo são os que as versões antigas erravam: `toFixed(2)` e
 * `Math.round(v * 100) / 100` fecham 1,005 em 1,00 (o binário guarda 1,00499…), e o
 * `Math.round` sozinho leva o meio negativo para +∞ (-10,005 → -10,00).
 */

import { describe, expect, test } from "bun:test"
import { roundToCents } from "./money.ts"

describe("roundToCents", () => {
	test("meio-centavo sobe, mesmo quando o binário guarda um pouco menos", () => {
		expect(roundToCents(10.005)).toBe(10.01)
		expect(roundToCents(1.005)).toBe(1.01)
		expect(roundToCents(10_000.005)).toBe(10_000.01)
	})

	test("negativo é simétrico: o meio-centavo vai para longe do zero", () => {
		expect(roundToCents(-10.005)).toBe(-10.01)
		expect(roundToCents(-1.005)).toBe(-1.01)
		for (const value of [0.005, 1.005, 10.005, 2.675, 1234.565, 0.125]) {
			expect(roundToCents(-value)).toBe(-roundToCents(value))
		}
	})

	test("abaixo do meio-centavo desce", () => {
		expect(roundToCents(10.00499)).toBe(10)
		expect(roundToCents(-10.00499)).toBe(-10)
	})

	test("soma de centavos com ruído de ponto flutuante volta ao centavo exato", () => {
		expect(roundToCents(0.1 + 0.2)).toBe(0.3)
		expect(roundToCents(1.01 - 1)).toBe(0.01)
	})

	test("zero nunca sai negativo, e não-finito vira zero", () => {
		expect(Object.is(roundToCents(-0.001), 0)).toBe(true)
		expect(Object.is(roundToCents(-0), 0)).toBe(true)
		expect(roundToCents(Number.NaN)).toBe(0)
		expect(roundToCents(Number.POSITIVE_INFINITY)).toBe(0)
	})

	test("soma longa com erro acumulado ainda fecha o meio-centavo", () => {
		// 25 × 0,347 = 8,675 exatos; em ponto flutuante a soma dá 8,674999999999994
		let total = 0
		for (let i = 0; i < 25; i++) total += 0.347
		expect(roundToCents(total)).toBe(8.68)
	})

	test("valores grandes mantêm o centavo até a escala de numeric(14,2)", () => {
		expect(roundToCents(12_345_678_901.23)).toBe(12_345_678_901.23)
		expect(roundToCents(99_999_999_999.99)).toBe(99_999_999_999.99)
		expect(roundToCents(999_999_999_999.99)).toBe(999_999_999_999.99)
		expect(roundToCents(-999_999_999_999.99)).toBe(-999_999_999_999.99)
		expect(roundToCents(123_456_789_012.345)).toBe(123_456_789_012.35)
	})
})
