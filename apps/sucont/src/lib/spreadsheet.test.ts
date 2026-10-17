import { describe, expect, it } from "bun:test"
import * as XLSX from "xlsx"
import { CSV_ENCODINGS } from "#/lib/__fixtures__/csv-encodings"
import { decodeSpreadsheet, readWorkbook } from "#/lib/spreadsheet"

const CSV = "UG;Conta Contábil;Saldo\n120062;113110101;1.234,56\n"

function firstSheetRows(workbook: XLSX.WorkBook): unknown[][] {
	return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })
}

describe("decodeSpreadsheet", () => {
	it.each(CSV_ENCODINGS)("%s: acento intacto, sem BOM no texto", (_label, encode) => {
		expect(decodeSpreadsheet(encode(CSV))).toBe(CSV)
	})

	// "Diárias" em windows-1252: o "á" é o byte 0xE1 sozinho, que não é UTF-8 válido.
	const latin1Diarias = new Uint8Array([0x44, 0x69, 0xe1, 0x72, 0x69, 0x61, 0x73])

	it("lê o export do Tesouro Gerencial (windows-1252) sem corromper acento", () => {
		expect(decodeSpreadsheet(latin1Diarias)).toBe("Diárias")
	})

	it("lê UTF-8 quando o arquivo é UTF-8", () => {
		expect(decodeSpreadsheet(new TextEncoder().encode("Mês de Lançamento"))).toBe("Mês de Lançamento")
	})

	it("remove o BOM do UTF-8", () => {
		const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("UG")])
		expect(decodeSpreadsheet(withBom)).toBe("UG")
	})

	// A regressão real: lido como UTF-8 tolerante, 0xE1 vira U+FFFD e o modelo recebe
	// "Di rias" em vez do fator de custo do Módulo 19.
	it("não deixa passar caractere de substituição", () => {
		expect(decodeSpreadsheet(latin1Diarias)).not.toContain("�")
	})
})

describe("readWorkbook", () => {
	it.each(CSV_ENCODINGS)("CSV %s: cabeçalho com acento e saldo como texto digitado", (_label, encode) => {
		expect(firstSheetRows(readWorkbook(encode(CSV)))).toEqual([
			["UG", "Conta Contábil", "Saldo"],
			["120062", "113110101", "1.234,56"],
		])
	})

	it("xlsx passa pelo leitor binário, com número como número", () => {
		const book = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(
			book,
			XLSX.utils.aoa_to_sheet([
				["UG", "Conta Contábil", "Saldo"],
				["120062", "113110101", 123.456],
			]),
			"a"
		)
		const rows = firstSheetRows(readWorkbook(XLSX.write(book, { type: "array", bookType: "xlsx" })))
		expect(rows).toEqual([
			["UG", "Conta Contábil", "Saldo"],
			["120062", "113110101", 123.456],
		])
	})

	it("Texto Unicode do Excel (UTF-16 LE, separado por tabulação)", () => {
		const [, encodeUtf16Le] = CSV_ENCODINGS.find(([label]) => label === "UTF-16 LE com BOM") ?? []
		if (!encodeUtf16Le) throw new Error("fixture sem UTF-16 LE")
		expect(firstSheetRows(readWorkbook(encodeUtf16Le("UG\tConta Contábil\tSaldo\r\n120062\t113110101\t1.234,56\r\n")))).toEqual([
			["UG", "Conta Contábil", "Saldo"],
			["120062", "113110101", "1.234,56"],
		])
	})

	it("texto renomeado para .xls é lido como texto, sem adivinhar número", () => {
		const html = "<table><tr><td>UG</td><td>Saldo</td></tr><tr><td>120062</td><td>1.234,56</td></tr></table>"
		expect(firstSheetRows(readWorkbook(new TextEncoder().encode(html)))).toEqual([
			["UG", "Saldo"],
			["120062", "1.234,56"],
		])
	})

	it("lança sem conteúdo", () => {
		expect(() => readWorkbook(new ArrayBuffer(0))).toThrow("O arquivo está vazio.")
		expect(() => readWorkbook(undefined)).toThrow("Não foi possível ler o arquivo.")
		expect(() => readWorkbook("texto")).toThrow("Não foi possível ler o arquivo.")
	})
})
