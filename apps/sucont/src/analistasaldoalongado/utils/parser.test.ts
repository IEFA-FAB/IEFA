import { describe, expect, it } from "bun:test"
import { parseSaldoCell } from "#/analistasaldoalongado/utils/parser"

describe("parseSaldoCell", () => {
	it("número do Excel (raw: true) passa direto", () => {
		expect(parseSaldoCell(1.234)).toBe(1.234)
		expect(parseSaldoCell(-50)).toBe(-50)
	})

	it("texto segue a regra compartilhada", () => {
		expect(parseSaldoCell("1.234,56")).toBe(1234.56)
		expect(parseSaldoCell("1,234.56")).toBe(1234.56)
		expect(parseSaldoCell("1500.25")).toBe(1500.25)
		// A cópia antiga lia o separador único como decimal.
		expect(parseSaldoCell("1.234")).toBe(1234)
	})

	it("parênteses viram negativo (a cópia antiga os tirava e o saldo ficava positivo)", () => {
		expect(parseSaldoCell("(1.234,56)")).toBe(-1234.56)
		expect(parseSaldoCell("R$ (500,00)")).toBe(-500)
	})

	it("mantém a tolerância a letras no texto, como a cópia antiga", () => {
		expect(parseSaldoCell("1.234,56 C")).toBe(1234.56)
		expect(parseSaldoCell("")).toBe(0)
		expect(parseSaldoCell("abc")).toBe(0)
		expect(parseSaldoCell(undefined)).toBe(0)
	})
})
