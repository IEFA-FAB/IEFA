import { describe, expect, it } from "bun:test"
import * as XLSX from "xlsx"
import { parseSaldoCell, readRawRows } from "#/analistasaldoalongado/utils/parser"
import { CSV_ENCODINGS } from "#/lib/__fixtures__/csv-encodings"

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

	it("lê o sinal na frente, no fim e junto dos parênteses", () => {
		expect(parseSaldoCell("+1.234")).toBe(1234)
		expect(parseSaldoCell("1.234-")).toBe(-1234)
		expect(parseSaldoCell("1.234,56- D")).toBe(-1234.56)
		// Antes virava 0: o "-" antes do parêntese quebrava a leitura.
		expect(parseSaldoCell("-(1.234,56)")).toBe(-1234.56)
		expect(parseSaldoCell("−1.234,56")).toBe(-1234.56)
	})

	it("vírgula sozinha é decimal", () => {
		expect(parseSaldoCell("12,345")).toBe(12.345)
	})

	it("lê o sufixo de natureza como as outras ferramentas", () => {
		expect(parseSaldoCell("1.234,56 C")).toBe(1234.56)
		expect(parseSaldoCell("1.234,56 D")).toBe(1234.56)
		expect(parseSaldoCell("1.234,56D")).toBe(1234.56)
		expect(parseSaldoCell("")).toBe(0)
		expect(parseSaldoCell("abc")).toBe(0)
		expect(parseSaldoCell(undefined)).toBe(0)
	})
})

describe("readRawRows", () => {
	it.each(CSV_ENCODINGS)('CSV %s: acha "Conta Contábil" com o acento', (_label, encode) => {
		const csv = "UG;Conta Contábil;Conta Corrente;Saldo\n120062;897110300;CC1;1.234,56\n"
		const [row] = readRawRows(encode(csv))
		expect(row).toEqual({ UG: "120062", "Conta Contábil": "897110300", "Conta Corrente": "CC1", Saldo: "1.234,56" })
	})

	it("CSV pt-BR: o saldo chega como texto e sai pela regra brasileira", () => {
		const csv =
			"UG;Conta Contábil;Conta Corrente;Saldo\n120062;897110300;CC1;1.234,56\n120062;897110300;CC2;1.234\n120062;897110300;CC3;12,345\n120062;897110300;CC4;(1.234,56) D\n"
		const rows = readRawRows(new TextEncoder().encode(csv))
		expect(rows.map((row) => parseSaldoCell(row.Saldo))).toEqual([1234.56, 1234, 12.345, -1234.56])
	})

	it("xlsx: número cru passa direto", () => {
		const book = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(
			book,
			XLSX.utils.aoa_to_sheet([
				["UG", "Saldo"],
				["120062", 123.456],
			]),
			"a"
		)
		expect(readRawRows(XLSX.write(book, { type: "array", bookType: "xlsx" }))).toEqual([{ UG: "120062", Saldo: 123.456 }])
	})
})
