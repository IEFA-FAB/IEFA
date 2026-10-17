import { describe, expect, it } from "bun:test"
import * as XLSX from "xlsx"
import { encodeWindows1252 } from "#/lib/__fixtures__/csv-encodings"
import { classifyGenericCode, PAYEE_999_REGEX, SUBITEM_99_REGEX } from "#/subitens/generic-code"
import { parseSaldo, parseWorkbook } from "#/subitens/parser"
import type { GenericCodeKind } from "#/subitens/types"

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
	it("lê CSV windows-1252 (ou texto renomeado para .xls) sem adivinhar número", () => {
		const preamble = Array.from({ length: 11 }, (_, i) => `Título ${i + 1}`)
		const csv = [...preamble, HEADER.join(";"), "120004 BABR;332110100;99;1.234,56", "120004 BABR;332110100;99;12,345"].join("\n")
		const [group] = parseWorkbook(encodeWindows1252(csv).buffer)
		expect(group.occurrences.map((o) => o.saldo)).toEqual([1234.56 + 12.345])
	})

	it("filtra códigos genéricos, marca o tipo, soma repetidos e agrupa por UG em ordem", () => {
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
					{ ug: "120001 GABAER", contaContabil: "332110100", contaCorrente: "12/99", genericKinds: ["subitem-99"], saldo: 0, racId: "RAC 28" },
					{ ug: "120001 GABAER", contaContabil: "332110100", contaCorrente: "999", genericKinds: ["favorecido-999"], saldo: 0, racId: "RAC 28" },
					{ ug: "120001 GABAER", contaContabil: "113110200", contaCorrente: "99A", genericKinds: ["subitem-99"], saldo: -2.5, racId: "RAC 28" },
				],
				totalSaldo: -2.5,
			},
			{
				ug: "120004 BABR",
				occurrences: [
					{ ug: "120004 BABR", contaContabil: "332110100", contaCorrente: "99", genericKinds: ["subitem-99"], saldo: 150, racId: "RAC 28" },
					{ ug: "120004 BABR", contaContabil: "113110200", contaCorrente: "P99", genericKinds: ["subitem-99"], saldo: 1234.56, racId: "RAC 28" },
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
				occurrences: [{ ug: "120001", contaContabil: "332110100", contaCorrente: "99", genericKinds: ["subitem-99"], saldo: 1000, racId: "RAC 28" }],
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

	it("sem código genérico devolve lista vazia", () => {
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

/** A regex única de antes, que marcava 99 e 999 juntos: o que é reconhecido não pode mudar. */
const LEGACY_GENERIC_REGEX = /(^|\D)(99|999)($|\D)/

describe("classifyGenericCode", () => {
	it.each<[string, GenericCodeKind[]]>([
		["99", ["subitem-99"]],
		["999", ["favorecido-999"]],
		["P99", ["subitem-99"]],
		["12/99", ["subitem-99"]],
		["99A", ["subitem-99"]],
		["A999B", ["favorecido-999"]],
		["3399", []],
		["1999", []],
		["9999", []],
		["9", []],
		["", []],
	])("%p → %p", (value, expected) => {
		expect(classifyGenericCode(value)).toEqual(expected)
	})

	// Formatos documentados (fontes no comentário de `generic-code.ts`). O último trava um
	// limite conhecido, não um acerto: mudar exige saber quais contas o relatório traz.
	it.each<[string, GenericCodeKind[], string]>([
		["P 99", ["subitem-99"], "estoque: ISF + subitem, como o SIAFI exibe"],
		["P99", ["subitem-99"], "estoque: ISF + subitem sem espaço"],
		["P 04", [], "estoque: subitem específico"],
		["P 96", [], "pagamento antecipado é transitório, não genérico"],
		["P999", ["favorecido-999"], "favorecido genérico do tipo 002 (02.03.18), com marca própria"],
		["33903099", [], "limite: subitem 99 colado à natureza de despesa não é visto"],
	])("%p → %p (%s)", (value, expected) => {
		expect(classifyGenericCode(value)).toEqual(expected)
	})

	it.each<[string, GenericCodeKind[], string]>([
		["P 99", ["subitem-99"], "subitem 99 continua marcado"],
		["999", ["favorecido-999"], "c/c 999 continua marcado, como favorecido"],
		["12.345.678/0001-99", [], "CNPJ formatado com DV 99"],
		["123.456.789-99", [], "CPF formatado com DV 99"],
		["P 123.456.789-99", [], "ISF + CPF formatado"],
		["123.456.789-99 / 99", ["subitem-99"], "CPF formatado ao lado de um subitem 99"],
		["123.456.789-99 / 999", ["favorecido-999"], "CPF formatado ao lado de um 999"],
		["12345678000199", [], "CNPJ só com dígitos, como o SIAFI grava"],
		["12345678/0001-99", ["subitem-99"], "limite: CNPJ com pontuação parcial ainda é marcado"],
	])("%p → %p (%s)", (value, expected) => {
		expect(classifyGenericCode(value)).toEqual(expected)
	})

	it.each([
		["999 / 99", "favorecido e subitem separados"],
		["99 999", "na ordem inversa, separados por espaço"],
		["P99/999", "colados por barra"],
	])("%p recebe as duas marcas, na ordem fixa (%s)", (value) => {
		expect(classifyGenericCode(value)).toEqual(["subitem-99", "favorecido-999"])
	})

	it("cada regex só vê o seu código", () => {
		expect(["99", "P 99", "12/99"].map((v) => [SUBITEM_99_REGEX.test(v), PAYEE_999_REGEX.test(v)])).toEqual([
			[true, false],
			[true, false],
			[true, false],
		])
		expect(["999", "P999", "A999B"].map((v) => [SUBITEM_99_REGEX.test(v), PAYEE_999_REGEX.test(v)])).toEqual([
			[false, true],
			[false, true],
			[false, true],
		])
	})

	// Sem planilha real do SUCONT-3.1 para validar o formato, a separação não pode mudar o
	// conjunto reconhecido: a união das duas marcas é exatamente o que a regex única marcava.
	it.each([
		"99",
		"999",
		"P99",
		"P 99",
		"P999",
		"12/99",
		"99A",
		"A999B",
		"999 / 99",
		"3399",
		"1999",
		"9999",
		"99999",
		"9",
		"",
		"P 04",
		"P 96",
		"33903099",
		"12345678000199",
		"12345678/0001-99",
		"999-99",
		"x99x999x",
	])("%p: reconhecido ⇔ a regex única reconhecia", (value) => {
		expect(classifyGenericCode(value).length > 0).toBe(LEGACY_GENERIC_REGEX.test(value))
	})

	it("parseWorkbook usa o mesmo critério e guarda as duas marcas", () => {
		const buffer = buildWorkbook(HEADER, [
			["120001", "1", "12.345.678/0001-99", 10],
			["120001", "1", "P 99", 5],
			["120001", "1", "999 / 99", 7],
			["120001", "1", "P999", 3],
		])
		expect(parseWorkbook(buffer)[0].occurrences.map((o) => [o.contaCorrente, o.genericKinds])).toEqual([
			["P 99", ["subitem-99"]],
			["999 / 99", ["subitem-99", "favorecido-999"]],
			["P999", ["favorecido-999"]],
		])
	})
})

describe("parseSaldo", () => {
	it("segue a regra compartilhada e conta 0 o que não for número", () => {
		// A cópia antiga tirava todo ponto ("1500.25" → 150025) e não lia parênteses.
		expect([10, "R$ 1.234,56", "1500.25", "(1.234,56)", "abc", undefined].map(parseSaldo)).toEqual([10, 1234.56, 1500.25, -1234.56, 0, 0])
	})
})
