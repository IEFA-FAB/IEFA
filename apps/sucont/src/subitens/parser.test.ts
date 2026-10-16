import { describe, expect, it } from "bun:test"
import * as XLSX from "xlsx"
import { GENERIC_SUBITEM_REGEX, isGenericSubitem, parseSaldo, parseWorkbook } from "#/subitens/parser"

/** Relatório do Tesouro Gerencial: onze linhas de título antes do cabeçalho (linha 12). */
function buildWorkbook(header: unknown[], rows: unknown[][], preamble = 11): ArrayBuffer {
	const aoa: unknown[][] = []
	for (let i = 0; i < preamble; i++) aoa.push([`Título ${i + 1}`])
	aoa.push(header, ...rows)
	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Relatório")
	return XLSX.write(wb, { type: "array", bookType: "xlsx" })
}

const HEADER = ["UG Executora", "Conta Contábil", "Conta Corrente", "Saldo - R$"]

describe("parseWorkbook", () => {
	it("filtra subitens genéricos, soma repetidos e agrupa por UG em ordem", () => {
		const buffer = buildWorkbook(HEADER, [
			["120004 BABR ", " 332110100 ", " 99 ", 100],
			["120004 BABR", "332110100", "99", 50],
			["120004 BABR", "332110100", "3399", 1000],
			["120004 BABR", "113110200", "P99", "R$ 1.234,56"],
			["120001 GABAER", "332110100", "12/99", "abc"],
			["120001 GABAER", "332110100", "999", ""],
			["120001 GABAER", "332110100", "1999", 5],
			["120001 GABAER", "113110200", "99A", -2.5],
		])
		expect(parseWorkbook(buffer)).toEqual([
			{
				ug: "120001 GABAER",
				occurrences: [
					{ ug: "120001 GABAER", contaContabil: "332110100", contaCorrente: "12/99", saldo: 0, racId: "RAC 28" },
					{ ug: "120001 GABAER", contaContabil: "332110100", contaCorrente: "999", saldo: 0, racId: "RAC 28" },
					{ ug: "120001 GABAER", contaContabil: "113110200", contaCorrente: "99A", saldo: -2.5, racId: "RAC 28" },
				],
				totalSaldo: -2.5,
			},
			{
				ug: "120004 BABR",
				occurrences: [
					{ ug: "120004 BABR", contaContabil: "332110100", contaCorrente: "99", saldo: 150, racId: "RAC 28" },
					{ ug: "120004 BABR", contaContabil: "113110200", contaCorrente: "P99", saldo: 1234.56, racId: "RAC 28" },
				],
				totalSaldo: 1384.56,
			},
		])
	})

	it("aceita cabeçalhos alternativos, sem diferenciar caixa nem espaços, e por trecho", () => {
		const buffer = buildWorkbook(["  ug  ", "CONTA", "cc", "Valor"], [[120001, 332110100, 99, "1.000,00"]])
		expect(parseWorkbook(buffer)).toEqual([
			{
				ug: "120001",
				occurrences: [{ ug: "120001", contaContabil: "332110100", contaCorrente: "99", saldo: 1000, racId: "RAC 28" }],
				totalSaldo: 1000,
			},
		])
		const porTrecho = buildWorkbook(["Código da UG Executora", "Conta Contábil", "Conta Corrente", "Saldo Final (R$)"], [["120001", "1", "99", 3]])
		expect(parseWorkbook(porTrecho)[0].totalSaldo).toBe(3)
	})

	it("ignora as onze primeiras linhas mesmo que pareçam cabeçalho", () => {
		const aoa = [HEADER, ["120001", "1", "99", 1], ...Array.from({ length: 9 }, () => ["x"]), HEADER, ["120004", "2", "999", 2]]
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Relatório")
		const result = parseWorkbook(XLSX.write(wb, { type: "array", bookType: "xlsx" }))
		expect(result.map((g) => g.ug)).toEqual(["120004"])
	})

	it("sem subitem genérico devolve lista vazia", () => {
		expect(parseWorkbook(buildWorkbook(HEADER, [["120001", "1", "1234", 10]]))).toEqual([])
	})

	it("planilha só com cabeçalho lança a mensagem de arquivo vazio", () => {
		expect(() => parseWorkbook(buildWorkbook(HEADER, []))).toThrow("O arquivo está vazio ou não contém dados válidos.")
	})

	it("planilha mais curta que o título lança a mensagem de arquivo vazio", () => {
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["só uma linha"]]), "Relatório")
		expect(() => parseWorkbook(XLSX.write(wb, { type: "array", bookType: "xlsx" }))).toThrow("O arquivo está vazio ou não contém dados válidos.")
	})

	it("lista todas as colunas que faltam, na ordem fixa", () => {
		expect(() => parseWorkbook(buildWorkbook(["A", "B"], [["1", "2"]]))).toThrow(
			"Não foi possível identificar as colunas: UG Executora, Conta Contábil, Conta Corrente, Saldo. Verifique o cabeçalho da planilha."
		)
	})

	it.each([
		[["Conta Contábil", "Conta Corrente", "Saldo"], "UG Executora"],
		[["UG Executora", "Corrente", "Saldo"], "Conta Contábil"],
		[["UG Executora", "Conta Contábil", "Saldo"], "Conta Corrente"],
		[["UG Executora", "Conta Contábil", "Conta Corrente"], "Saldo"],
	])("acusa só a coluna que falta (%p)", (header, missing) => {
		expect(() => parseWorkbook(buildWorkbook(header, [header.map(() => "99")]))).toThrow(
			`Não foi possível identificar as colunas: ${missing}. Verifique o cabeçalho da planilha.`
		)
	})
})

describe("GENERIC_SUBITEM_REGEX", () => {
	it.each([
		["99", true],
		["999", true],
		["P99", true],
		["12/99", true],
		["99A", true],
		["A999B", true],
		["3399", false],
		["1999", false],
		["9999", false],
		["9", false],
		["", false],
	])("%p → %p", (value, expected) => {
		expect(GENERIC_SUBITEM_REGEX.test(value)).toBe(expected)
	})

	// Formatos documentados (fontes no comentário da regex). Os dois últimos travam limites
	// conhecidos, não acertos: mudar exige saber quais contas o relatório traz.
	it.each([
		["P 99", true, "estoque: ISF + subitem, como o SIAFI exibe"],
		["P99", true, "estoque: ISF + subitem sem espaço"],
		["P 04", false, "estoque: subitem específico"],
		["P 96", false, "pagamento antecipado é transitório, não genérico"],
		["P999", true, "favorecido genérico do tipo 002 (02.03.18), marcado junto"],
		["33903099", false, "limite: subitem 99 colado à natureza de despesa não é visto"],
	])("%p → %p (%s)", (value, expected) => {
		expect(GENERIC_SUBITEM_REGEX.test(value)).toBe(expected)
	})
})

describe("isGenericSubitem", () => {
	it.each([
		["P 99", true, "subitem 99 continua marcado"],
		["999", true, "c/c 999 continua marcado"],
		["12.345.678/0001-99", false, "CNPJ formatado com DV 99"],
		["123.456.789-99", false, "CPF formatado com DV 99"],
		["P 123.456.789-99", false, "ISF + CPF formatado"],
		["123.456.789-99 / 99", true, "CPF formatado ao lado de um subitem 99"],
		["12345678000199", false, "CNPJ só com dígitos, como o SIAFI grava"],
		["12345678/0001-99", true, "limite: CNPJ com pontuação parcial ainda é marcado"],
	])("%p → %p (%s)", (value, expected) => {
		expect(isGenericSubitem(value)).toBe(expected)
	})

	it("parseWorkbook usa o mesmo critério", () => {
		const buffer = buildWorkbook(HEADER, [
			["120001", "1", "12.345.678/0001-99", 10],
			["120001", "1", "P 99", 5],
		])
		expect(parseWorkbook(buffer)[0].occurrences.map((o) => o.contaCorrente)).toEqual(["P 99"])
	})
})

describe("parseSaldo", () => {
	it("segue a regra compartilhada e conta 0 o que não for número", () => {
		// A cópia antiga tirava todo ponto ("1500.25" → 150025) e não lia parênteses.
		expect([10, "R$ 1.234,56", "1500.25", "(1.234,56)", "abc", undefined].map(parseSaldo)).toEqual([10, 1234.56, 1500.25, -1234.56, 0, 0])
	})
})
