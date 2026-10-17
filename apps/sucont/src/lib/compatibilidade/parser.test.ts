import { describe, expect, it } from "bun:test"
import * as XLSX from "xlsx"
import { PARES } from "./pares"
import { PAIR_COLORS, parseSaldo, processData, type SheetRow } from "./parser"

const [PAR_CAUCAO, PAR_CONSUMO, PAR_BMP] = PARES

const HEADER = ["UG", "Conta Contábil", "Saldo - R$"]

/** Mesmo caminho da tela: workbook → ArrayBuffer → `XLSX.read` → `sheet_to_json({ header: 1 })`. */
function rowsFromWorkbook(aoa: unknown[][]): SheetRow[] {
	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Planilha1")
	const ab = XLSX.write(wb, { type: "array", bookType: "xlsx" })
	const read = XLSX.read(ab, { type: "array" })
	return XLSX.utils.sheet_to_json(read.Sheets[read.SheetNames[0]], { header: 1 }) as SheetRow[]
}

function parseSheet(aoa: unknown[][]) {
	return processData(rowsFromWorkbook(aoa))
}

const HEADER_ERROR = "Não foi possível identificar as colunas 'UG', 'Conta Contábil' e 'Saldo - R$'. Verifique se elas existem na planilha."

describe("processData: cabeçalho", () => {
	it("lança quando a planilha está vazia", () => {
		expect(() => processData([])).toThrow("A planilha está vazia.")
	})

	it("lança quando não acha as três colunas", () => {
		expect(() =>
			parseSheet([
				["UG", "Conta Contábil", "Valor"],
				["120062", PAR_BMP.a, 10],
			])
		).toThrow(HEADER_ERROR)
	})

	it("acha o cabeçalho depois de linhas de título e aceita 'Unidade Gestora' com acento e caixa alta", () => {
		const reports = parseSheet([["Relatório do Tesouro Gerencial"], [], ["  UNIDADE GESTORA ", "CONTA CONTÁBIL", "SALDO ATUAL"], ["120062", PAR_BMP.a, 100]])
		expect(reports).toHaveLength(1)
		expect(reports[0].ug).toBe("120062")
	})

	it("só procura o cabeçalho nas 50 primeiras linhas", () => {
		const filler = Array.from({ length: 50 }, (_, i) => [`linha ${i}`])
		expect(() => parseSheet([...filler, HEADER, ["120062", PAR_BMP.a, 100]])).toThrow(HEADER_ERROR)
		const reports = parseSheet([...filler.slice(1), HEADER, ["120062", PAR_BMP.a, 100]])
		expect(reports).toHaveLength(1)
	})

	it("pula linha que não é array e célula 0 no cabeçalho vira texto vazio", () => {
		const data = [undefined, [0, "UG", "Conta", "Saldo"], ["x", "120062", PAR_BMP.a, 100]] as unknown as SheetRow[]
		const reports = processData(data)
		expect(reports.map((r) => r.ug)).toEqual(["120062"])
	})

	it("'ug' exato vence; 'conta' é testado antes de 'saldo' e a última coluna que casa fica", () => {
		// "Saldo da conta" contém "conta": vira coluna de conta e é sobrescrita pela
		// coluna "Conta" à direita. A coluna de saldo é a última que contém "saldo".
		const reports = processData([
			["Saldo da conta", "UG", "Conta", "Saldo inicial", "Saldo final"],
			["ignorado", "120062", PAR_BMP.a, 999, 100],
		])
		expect(reports[0].pairs[0].saldoA).toBe(100)
	})
})

describe("processData: linhas", () => {
	it("pula linhas sem UG ou sem conta e linhas que não são array", () => {
		const data = [
			HEADER,
			[undefined, PAR_BMP.a, 1],
			[null, PAR_BMP.a, 2],
			["", PAR_BMP.a, 3],
			["120062", undefined, 4],
			["120062", null, 5],
			["120062", "", 6],
			"linha solta",
			["120062", PAR_BMP.a, 100],
		] as unknown as SheetRow[]
		const reports = processData(data)
		expect(reports).toHaveLength(1)
		expect(reports[0].pairs[0].saldoA).toBe(100)
	})

	it("limpa a conta para dígitos e apara a UG", () => {
		const reports = parseSheet([HEADER, ["  120062  ", PAR_BMP.formattedA, 100]])
		expect(reports[0].ug).toBe("120062")
		expect(reports[0].pairs[0].id).toBe(PAR_BMP.id)
	})

	it("lê saldo numérico, texto em formato brasileiro, texto inválido e tipo não numérico", () => {
		const reports = processData([
			HEADER,
			["120001", PAR_BMP.a, 10.5],
			["120002", PAR_BMP.a, "1.234,56"],
			["120004", PAR_BMP.a, "abc"],
			["120004", PAR_BMP.b, 50],
			["120005", PAR_BMP.a, true],
			["120005", PAR_BMP.b, 7],
		])
		const byUg = Object.fromEntries(reports.map((r) => [r.ug, r.pairs[0]]))
		expect(byUg["120001"].saldoA).toBe(10.5)
		expect(byUg["120002"].saldoA).toBe(1234.56)
		// texto inválido vira 0 (a conta existe, com saldo zero)
		expect(byUg["120004"].saldoA).toBe(0)
		expect(byUg["120004"].hasA).toBe(true)
		// booleano não é número nem texto: saldo 0
		expect(byUg["120005"].saldoA).toBe(0)
	})

	it("soma as linhas repetidas da mesma UG e conta", () => {
		const reports = parseSheet([HEADER, ["120062", PAR_BMP.a, 300], ["120062", PAR_BMP.a, 200], ["120062", PAR_BMP.b, 500]])
		expect(reports).toEqual([])
	})
})

describe("processData: relatório", () => {
	it("par equilibrado não gera relatório", () => {
		expect(parseSheet([HEADER, ["120062", PAR_CAUCAO.a, 100], ["120062", PAR_CAUCAO.b, 100]])).toEqual([])
	})

	it("monta o relatório completo de uma UG do cadastro", () => {
		const [report] = parseSheet([HEADER, ["120001", PAR_CAUCAO.a, 1500.25], ["120001", PAR_CAUCAO.b, 1000], ["120001", PAR_CONSUMO.b, 40]])
		expect(report).toEqual({
			ug: "120001",
			ugCode: "120001",
			ugName: "GABAER",
			superior: "GABAER",
			ods: "GABAER",
			conferente: "1S ELIANA",
			totalDiff: 540.25,
			divergencias: [
				"1) Conta 111111903 - CAIXA ECONÔMICA FEDERAL × Conta 811110113 - CAUÇÃO A EXECUTAR\n\nSaldo da conta 111111903: R$\u00a01.500,25\nSaldo da conta 811110113: R$\u00a01.000,00\n\nDiferença apurada: R$\u00a0500,25",
				"2) Conta 115511000 - MATERIAIS DE CONSUMO EM TRÂNSITO × Conta 899920102 - BENS DE ESTOQUE ENVIADOS\n\nSaldo da conta 115511000: CONTA NÃO LOCALIZADA NO RELATÓRIO\nSaldo da conta 899920102: R$\u00a040,00\n\nDiferença apurada: -R$\u00a040,00",
			],
			chartData: [
				{
					name: "Par 1",
					description: "111111903 (CAIXA ECONÔMICA FEDERAL) × 811110113 (CAUÇÃO A EXECUTAR)",
					value: 500.25,
					color: PAIR_COLORS[0],
					question: PAR_CAUCAO.question,
				},
				{
					name: "Par 2",
					description: "115511000 (MATERIAIS DE CONSUMO EM TRÂNSITO) × 899920102 (BENS DE ESTOQUE ENVIADOS)",
					value: 40,
					color: PAIR_COLORS[1],
					question: PAR_CONSUMO.question,
				},
			],
			pairs: [
				{ ...PAR_CAUCAO, saldoA: 1500.25, saldoB: 1000, diff: 500.25, hasA: true, hasB: true },
				{ ...PAR_CONSUMO, saldoA: undefined, saldoB: 40, diff: -40, hasA: false, hasB: true },
			],
		})
	})

	it("lado B ausente aparece como conta não localizada", () => {
		const [report] = parseSheet([HEADER, ["120001", PAR_BMP.a, 10]])
		expect(report.divergencias[0]).toContain(`Saldo da conta ${PAR_BMP.b}: CONTA NÃO LOCALIZADA NO RELATÓRIO`)
		expect(report.chartData[0].color).toBe(PAIR_COLORS[2])
	})

	it("par com um lado só zerado é divergência com diferença zero", () => {
		const reports = parseSheet([HEADER, ["120001", PAR_BMP.a, 0]])
		expect(reports).toHaveLength(1)
		expect(reports[0].totalDiff).toBe(0)
	})

	it("UG do cadastro sem conferente fica 'Não Identificado'", () => {
		const [report] = parseSheet([HEADER, ["120017", PAR_BMP.a, 10]])
		expect(report.ugName).toBe("II COMAR")
		expect(report.superior).toBe("COMPREP")
		expect(report.ods).toBe("COMPREP")
		expect(report.conferente).toBe("Não Identificado")
	})

	it("UG fora do cadastro: nome sai do texto depois de ' - ', senão o próprio texto", () => {
		const reports = parseSheet([HEADER, ["999999 - UG TESTE", PAR_BMP.a, 20], ["SEM CODIGO", PAR_BMP.a, 10]])
		expect(reports.map((r) => [r.ug, r.ugCode, r.ugName, r.superior, r.ods, r.conferente])).toEqual([
			["999999 - UG TESTE", "999999", "UG TESTE", "Não Identificado", "Não Identificado", "Não Identificado"],
			["SEM CODIGO", "SEM CODIGO", "SEM CODIGO", "Não Identificado", "Não Identificado", "Não Identificado"],
		])
	})

	it("UG do cadastro com nome no texto usa a sigla do cadastro", () => {
		const [report] = parseSheet([HEADER, ["120001 - OUTRO NOME", PAR_BMP.a, 10]])
		expect(report.ugCode).toBe("120001")
		expect(report.ugName).toBe("GABAER")
	})

	it("ordena pela diferença total decrescente; empate segue a ordem das chaves (código numérico em ordem crescente)", () => {
		const reports = parseSheet([HEADER, ["120075", PAR_BMP.a, 100], ["120062", PAR_BMP.a, 100], ["120001", PAR_BMP.a, 5], ["120002", PAR_BMP.a, 900]])
		expect(reports.map((r) => r.ug)).toEqual(["120002", "120062", "120075", "120001"])
	})
})

describe("parseSaldo", () => {
	it("segue a regra compartilhada e conta 0 o que não for número", () => {
		// A cópia antiga tirava todo ponto ("1500.25" → 150025) e devolvia 0 para parênteses.
		expect([1234.5, "1.234,56", "1500.25", "(1.234,56)", "1.234", "abc", null, true].map(parseSaldo)).toEqual([
			1234.5, 1234.56, 1500.25, -1234.56, 1234, 0, 0, 0,
		])
	})
})
