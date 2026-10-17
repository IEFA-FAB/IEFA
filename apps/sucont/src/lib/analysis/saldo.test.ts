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
		["1.234.567", 1234567],
		// Vírgula sozinha é SEMPRE decimal em pt-BR, mesmo seguida de três dígitos.
		["1,234", 1.234],
		["12,345", 12.345],
		["1,5", 1.5],
		["0,500", 0.5],
		["1.234,", 1234],
		// Vírgula antes do ponto só tem a leitura inglesa.
		["1,234.56", 1234.56],
		["-1,234,567.8", -1234567.8],
		// Sinal: na frente, no fim (relatório contábil) e em parênteses; as marcas não se cancelam.
		["+1.234", 1234],
		["+1.234,56", 1234.56],
		["1.234-", -1234],
		["1.234,56-", -1234.56],
		["R$ 1.234,56-", -1234.56],
		["-(1.234,56)", -1234.56],
		["(-1.234,56)", -1234.56],
		["−1.234,56", -1234.56],
		["(0,00)", 0],
		["$ 10,00", 10],
		// Sufixo de natureza: sai, e a natureza é ignorada.
		["1.234,56 C", 1234.56],
		["1.234,56 D", 1234.56],
		["1.234,56D", 1234.56],
		["1.234,56c", 1234.56],
		["1.234,56\u00a0D", 1234.56],
		["R$ 1.234,56 D", 1234.56],
		["(1.234,56) C", -1234.56],
		["1.234,56- D", -1234.56],
		// Vírgula decimal sem parte inteira.
		[",5", 0.5],
		["-,50", -0.5],
	])("%p → %p", (raw, expected) => {
		expect(parseBrazilianAmount(raw)).toBe(expected)
	})

	it("o que não é número sai NaN", () => {
		expect(parseBrazilianAmount("abc")).toBeNaN()
		expect(parseBrazilianAmount("")).toBeNaN()
		expect(parseBrazilianAmount(true)).toBeNaN()
		expect(parseBrazilianAmount(null)).toBeNaN()
	})

	it.each(["12,3,4", "1,234,567", "1.23.4", "12abc", "1.234,56X", "D", "1.234,56CD", "-1.234-", "--1", "(1.234", ",", "."])(
		"formato ambíguo ou com lixo sai NaN: %p",
		(raw) => {
			expect(parseBrazilianAmount(raw)).toBeNaN()
		}
	)

	it("zero negativo não existe", () => {
		expect(Object.is(parseBrazilianAmount("-0,00"), 0)).toBe(true)
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
