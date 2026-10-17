// Caracterização do parser da rota /monitoramento (port do Analistasaldoimproprio).
// O workbook é montado em memória e passa pelo mesmo `XLSX.write`/`XLSX.read` que
// o `FileReader.readAsArrayBuffer` da tela entrega ao parser.
import { describe, expect, it } from "bun:test"
import * as XLSX from "xlsx"
import { encodeWindows1252 } from "#/lib/__fixtures__/csv-encodings"
import { parseWorkbook } from "./monitoramento-parser"
import type { ProcessedRow } from "./types"

function toWorkbook(...sheets: unknown[][][]): ArrayBuffer {
	const wb = XLSX.utils.book_new()
	sheets.forEach((aoa, i) => {
		XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), `Planilha${i + 1}`)
	})
	return XLSX.write(wb, { type: "array", bookType: "xlsx" })
}

const MERCADORIAS = "MERCADORIAS PARA VENDA OU REVENDA"

function cobranca(ug: string, mes: string, saldo: number): ProcessedRow {
	return {
		ug,
		mes,
		conta: "115110101",
		descricao: MERCADORIAS,
		saldo,
		classificacao: "COBRANÇA",
		observacao: undefined,
		questaoRAC: "Questão 35",
	}
}

describe("parseWorkbook: leitura", () => {
	it("lança quando a planilha não é um Excel válido", () => {
		const corrupted = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]).buffer
		expect(() => parseWorkbook(corrupted)).toThrow("Unsupported ZIP file")
	})

	it("lança sem conteúdo nenhum", () => {
		expect(() => parseWorkbook(undefined)).toThrow()
		expect(() => parseWorkbook(null)).toThrow()
	})

	it("CSV windows-1252 (ou texto renomeado para .xls) é lido sem adivinhar número", () => {
		const csv = "Unidade Gestora;Mês;Conta Contábil;Saldo - R$\n120062;JAN;115110101;1.234,56\n120062;FEV;115110101;12,345\n"
		const result = parseWorkbook(encodeWindows1252(csv))
		expect(result.isHeaderFound).toBe(true)
		expect(result.processed.map((row) => [row.mes, row.saldo])).toEqual([
			["JAN", 1234.56],
			["FEV", 12.345],
		])
	})

	it("planilha vazia não tem cabeçalho", () => {
		expect(parseWorkbook(toWorkbook([]))).toEqual({ processed: [], isHeaderFound: false })
	})

	it("só lê a primeira aba", () => {
		const header = ["UG", "Mês", "Conta Contábil", "Saldo"]
		const result = parseWorkbook(toWorkbook([header], [header, ["120062", "JAN/2026", "115110101", 10]]))
		expect(result).toEqual({ processed: [], isHeaderFound: true })
	})
})

describe("parseWorkbook: ramo com cabeçalho", () => {
	it("acha o cabeçalho abaixo de linhas de título e classifica cada linha", () => {
		const result = parseWorkbook(
			toWorkbook([
				["Relatório do Tesouro Gerencial"],
				[2026],
				["Unidade Gestora", "Mês Referência", "Conta Contábil", "Saldo - R$"],
				["120062", "JAN/2026", "115110101", 1500],
				["120039", "JAN/2026", "115110101 - MERCADORIAS", -20.5],
				["120062", "FEV/2026", "999999999 - CONTA SEM REGRA", 7],
			])
		)
		expect(result.isHeaderFound).toBe(true)
		expect(result.processed).toEqual<ProcessedRow[]>([
			cobranca("120062", "JAN/2026", 1500),
			{
				ug: "120039",
				mes: "JAN/2026",
				conta: "115110101",
				descricao: MERCADORIAS,
				saldo: -20.5,
				classificacao: "EXCEÇÃO PREVISTA",
				observacao: undefined,
				questaoRAC: "Questão 35",
			},
			{
				ug: "120062",
				mes: "FEV/2026",
				conta: "999999999",
				descricao: "999999999 - CONTA SEM REGRA",
				saldo: 7,
				classificacao: "FORA DO ESCOPO PARAMETRIZADO",
				observacao: undefined,
				questaoRAC: undefined,
			},
		])
	})

	it("aceita os sinônimos de coluna, ignora conta bancária e célula não textual", () => {
		const result = parseWorkbook(
			toWorkbook([
				[123, "Cod UG", "Período", "Cód. Conta", "Conta Bancária", "Valor"],
				[null, "120062", "MAR/2026", "115110101", "999", 42],
			])
		)
		expect(result).toEqual({ processed: [cobranca("120062", "MAR/2026", 42)], isHeaderFound: true })
	})

	it("na mesma linha de cabeçalho, a última coluna que casa vence", () => {
		const result = parseWorkbook(
			toWorkbook([
				["UG", "Mês", "Conta", "Saldo Inicial", "Saldo Final"],
				["120062", "ABR/2026", "115110101", 1, 2],
			])
		)
		expect(result.processed).toEqual([cobranca("120062", "ABR/2026", 2)])
	})

	it("cabeçalho incompleto não conta: segue procurando nas linhas de baixo", () => {
		const result = parseWorkbook(
			toWorkbook([
				["UG", "Mês", "Conta"],
				["Referência", "Código UG", "Conta Contábil", "Saldo"],
				["MAI/2026", "120062", "115110101", 3],
			])
		)
		expect(result).toEqual({ processed: [cobranca("120062", "MAI/2026", 3)], isHeaderFound: true })
	})

	it("converte saldo em texto nos formatos brasileiro, com vírgula e com ponto", () => {
		const result = parseWorkbook(
			toWorkbook([
				["UG", "Mês", "Conta", "Saldo"],
				["120062", "JAN", "115110101", "R$ 1.234,56"],
				["120062", "FEV", "115110101", "1234,5"],
				["120062", "MAR", "115110101", "1500.25"],
				// Só pontos em grupos de três: milhar, como no formato brasileiro (o port lia 1,234).
				["120062", "ABR", "115110101", "1.234"],
				["120062", "MAI", "115110101", "-R$ 10,00"],
				["120062", "JUN", "115110101", "12.345.678"],
				// Parênteses: negativo (o port devolvia NaN e a linha sumia).
				["120062", "JUL", "115110101", "(1.234,56)"],
				["120062", "AGO", "115110101", "R$ (500)"],
				["120062", "SET", "115110101", "(1.234)"],
			])
		)
		expect(result.processed.map((r) => r.saldo)).toEqual([1234.56, 1234.5, 1500.25, 1234, -10, 12345678, -1234.56, -500, -1234])
	})

	it("descarta linha com célula vazia, saldo zero, saldo ilegível ou UG fora do acompanhamento", () => {
		const result = parseWorkbook(
			toWorkbook([
				["UG", "Mês", "Conta", "Saldo"],
				[null, "JAN", "115110101", 1],
				["  ", "JAN", "115110101", 1],
				["120062", null, "115110101", 1],
				["120062", " ", "115110101", 1],
				["120062", "JAN", null, 1],
				["120062", "JAN", "", 1],
				["120062", "JAN", "115110101", null],
				["120062", "JAN", "115110101", "   "],
				["120062", "JAN", "115110101", 0],
				["120062", "JAN", "115110101", "abc"],
				["120062", "JAN", "115110101", true],
				["170999", "JAN", "115110101", 5],
				["170999 - MAER DIF CAMBIAL", "JAN", "115110101", 5],
				[" 120062 ", " JUN ", " 115110101 ", 9],
			])
		)
		expect(result).toEqual({ processed: [cobranca("120062", "JUN", 9)], isHeaderFound: true })
	})
})

describe("parseWorkbook: fallback heurístico", () => {
	it("entra quando o cabeçalho existe mas nenhuma linha foi aproveitada pelas colunas dele", () => {
		const result = parseWorkbook(
			toWorkbook([
				["UG", "Mês", "Conta", "Saldo"],
				[null, "120062", "jan/2026", "115110101", 500],
				[null, 120062, "01/2026", 115110101, "R$ 10,00"],
				[null, "março", "120062", "TEXTO", "115110101", 7],
			])
		)
		expect(result).toEqual({
			processed: [cobranca("120062", "jan/2026", 500), cobranca("120062", "01/2026", 10), cobranca("120062", "março", 7)],
			isHeaderFound: true,
		})
	})

	it("palavra que não é mês não vira competência", () => {
		const result = parseWorkbook(
			toWorkbook([
				["UG", "Mês", "Conta", "Saldo"],
				// O port tomava "TOTAL" como mês; o "FEV/2026" que vinha depois ficava sem lugar.
				[null, "120062", "TOTAL", "FEV/2026", "115110101", 5],
				[null, "120062", "BASP", "115110101", 6],
				[null, "120062", "13/2026", "115110101", 7],
				[null, "120062", "Março/2026", "115110101", 8],
			])
		)
		expect(result.processed).toEqual([cobranca("120062", "FEV/2026", 5), cobranca("120062", "Março/2026", 8)])
	})

	it("aceita mês abreviado em inglês, além do português", () => {
		const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
		const result = parseWorkbook(toWorkbook([["UG", "Mês", "Conta", "Saldo"], ...months.map((mes, i) => [null, "120062", mes, "115110101", i + 1])]))
		expect(result.processed).toEqual(months.map((mes, i) => cobranca("120062", mes, i + 1)))
		const withYear = parseWorkbook(toWorkbook([["120062", "OCT/2026", "115110101", 5]]))
		expect(withYear.processed).toEqual([cobranca("120062", "OCT/2026", 5)])
	})

	it("um segundo código de 6 dígitos vira saldo se o saldo ainda não apareceu", () => {
		const result = parseWorkbook(
			toWorkbook([
				["UG", "Mês", "Conta", "Saldo"],
				[null, "120062", "120039", "115110101", "JAN"],
			])
		)
		expect(result.processed).toEqual([cobranca("120062", "JAN", 120039)])
	})

	it("descarta linha sem algum dos quatro campos, com saldo zero ou de UG fora do acompanhamento", () => {
		const result = parseWorkbook(
			toWorkbook([
				["UG", "Mês", "Conta", "Saldo"],
				[null, "JAN", "115110101", 5],
				[null, "120062", "115110101", 5],
				[null, "120062", "JAN", 5],
				[null, "120062", "JAN", "115110101", "TEXTO"],
				[null, "120062", "JAN", "115110101", 0],
				[null, "170999", "JAN", "115110101", 5],
			])
		)
		expect(result).toEqual({ processed: [], isHeaderFound: true })
	})

	it("sem cabeçalho é falha de leitura, mesmo que o fallback aproveite linhas", () => {
		const result = parseWorkbook(toWorkbook([["120062", "JAN/2026", "115110101", 5]]))
		expect(result).toEqual({ processed: [cobranca("120062", "JAN/2026", 5)], isHeaderFound: false })
	})
})
