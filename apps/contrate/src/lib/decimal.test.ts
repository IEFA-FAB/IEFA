import { describe, expect, test } from "bun:test"
import { parseDecimal } from "./decimal"

describe("parseDecimal", () => {
	test("ponto é milhar, como o campo mostra", () => {
		expect(parseDecimal("1.500")).toBe(1500)
		expect(parseDecimal("12.500")).toBe(12500)
		expect(parseDecimal("1.234.567")).toBe(1234567)
	})

	test("vírgula é decimal", () => {
		expect(parseDecimal("1.234,56")).toBe(1234.56)
		expect(parseDecimal("50946,28")).toBe(50946.28)
	})

	test("ponto que não pode ser milhar é decimal", () => {
		expect(parseDecimal("12.5")).toBe(12.5)
		expect(parseDecimal("3.14")).toBe(3.14)
	})

	test("vazio e inválido", () => {
		expect(parseDecimal("  ")).toBeNull()
		expect(Number.isNaN(parseDecimal("abc") as number)).toBe(true)
		expect(Number.isNaN(parseDecimal("-3") as number)).toBe(true)
	})
})
