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
})
