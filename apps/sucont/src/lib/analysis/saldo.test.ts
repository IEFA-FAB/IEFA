import { describe, expect, it } from "bun:test"
import { parseBrazilianAmount, parseBrazilianAmountOrZero } from "#/lib/analysis/saldo"

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
		// Grupo inicial zero não é milhar.
		["0.500", 0.5],
		["-0.123", -0.123],
		["0.5", 0.5],
		// Parênteses: negativo.
		["(1.234,56)", -1234.56],
		["R$ (500)", -500],
		["(1.234)", -1234],
		// Os dois separadores: o último é o decimal (o SheetJS formata em inglês com raw: false).
		["1,234.56", 1234.56],
		["-1,234,567.8", -1234567.8],
		// Vírgula só no padrão de milhar: milhar.
		["1,234", 1234],
		["0,500", 0.5],
		["12,3,4", 12.3],
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

describe("parseBrazilianAmountOrZero", () => {
	it("o que não é número conta 0; NaN numérico também", () => {
		expect(parseBrazilianAmountOrZero("abc")).toBe(0)
		expect(parseBrazilianAmountOrZero(Number.NaN)).toBe(0)
		expect(parseBrazilianAmountOrZero(undefined)).toBe(0)
		expect(parseBrazilianAmountOrZero("(1.234,56)")).toBe(-1234.56)
	})
})
