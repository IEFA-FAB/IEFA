import { describe, expect, it } from "bun:test"
import { parseBrazilianAmount } from "#/lib/analysis/saldo"

describe("parseBrazilianAmount", () => {
	it.each([
		[1234.56, 1234.56],
		["1.234,56", 1234.56],
		["R$ 1.234,56", 1234.56],
		["-R$ 10,00", -10],
		["1234,5", 1234.5],
		["-10,5", -10.5],
		// Ponto só é milhar no padrão de milhar.
		["1.234", 1234],
		["12.345.678", 12345678],
		["-1.234", -1234],
		["1500.25", 1500.25],
		["1.5", 1.5],
		// Parênteses: negativo.
		["(1.234,56)", -1234.56],
		["R$ (500)", -500],
		["(1.234)", -1234],
	])("%p → %p", (raw, expected) => {
		expect(parseBrazilianAmount(raw)).toBe(expected)
	})

	it("o que não é número sai NaN", () => {
		expect(parseBrazilianAmount("abc")).toBeNaN()
		expect(parseBrazilianAmount("")).toBeNaN()
		expect(parseBrazilianAmount(true)).toBeNaN()
		expect(parseBrazilianAmount(null)).toBeNaN()
	})
})
