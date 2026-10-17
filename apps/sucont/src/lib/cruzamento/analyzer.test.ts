import { describe, expect, it } from "bun:test"
import * as XLSX from "xlsx"
import {
	analyzeData,
	CONTA_EXECUCAO_RESPONSABILIDADE,
	CONTA_RESPONSABILIDADE,
	parseSaldoCell,
	type RawRecord,
	readRecords,
	UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE,
} from "./analyzer"

const rec = (UG: string, ContaContabil: string, ContaCorrente: string, Saldo: number): RawRecord => ({ UG, ContaContabil, ContaCorrente, Saldo })

const statusDe = (records: RawRecord[], contaCorrente: string) => {
	const { ugAnalysis } = analyzeData(records)
	return ugAnalysis.flatMap((u) => u.details).find((d) => d.contaCorrente === contaCorrente)?.status
}

describe("cruzamento 897210300 × 897110300 (Q22)", () => {
	it("ignora contas fora do par", () => {
		const { stats } = analyzeData([rec("120062", "123119905", "CC1", 100)])
		expect(stats.totalUgs).toBe(0)
	})

	it("considera regular o conta corrente espelhado", () => {
		const records = [
			rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 500),
			rec("120062", CONTA_RESPONSABILIDADE, "CC1", 500),
		]
		const { ugAnalysis } = analyzeData(records)
		expect(ugAnalysis.every((u) => u.status === "REGULAR")).toBe(true)
		expect(ugAnalysis.every((u) => u.inconsistenciesCount === 0)).toBe(true)
	})

	it("soma as linhas do mesmo lado antes de comparar", () => {
		const records = [
			rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 300),
			rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 200),
			rec("120062", CONTA_RESPONSABILIDADE, "CC1", 500),
		]
		expect(statusDe(records, "CC1")).toBeUndefined()
	})

	it("não vê divergência no ruído de ponto flutuante do parse de moeda", () => {
		const records = [
			rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 0.1 + 0.2),
			rec("120062", CONTA_RESPONSABILIDADE, "CC1", 0.3),
		]
		expect(statusDe(records, "CC1")).toBeUndefined()
	})

	it("aponta ausência quando só um dos lados registra", () => {
		expect(statusDe([rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 100)], "CC1")).toBe("AUSÊNCIA NA 897110300")
		expect(statusDe([rec("120062", CONTA_RESPONSABILIDADE, "CC2", 100)], "CC2")).toBe("AUSÊNCIA NA 897210300")
	})

	it("aponta divergência de saldo quando os dois lados registram valores diferentes", () => {
		const records = [
			rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 500),
			rec("120062", CONTA_RESPONSABILIDADE, "CC1", 450),
		]
		const { ugAnalysis } = analyzeData(records)
		const alvo = ugAnalysis.find((u) => u.inconsistenciesCount > 0)
		expect(alvo?.status).toBe("ATENÇÃO")
		expect(alvo?.financialImpact).toBe(50)
	})

	it("trata como crítica a UG não autorizada na conta de execução", () => {
		const records = [rec("120062", CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 100), rec("120062", CONTA_RESPONSABILIDADE, "CC1", 100)]
		const { ugAnalysis } = analyzeData(records)
		const alvo = ugAnalysis.find((u) => u.ug === "120062")
		expect(alvo?.status).toBe("CRÍTICA")
		expect(alvo?.details[0].status).toBe("UG INDEVIDA NA 897210300")
		expect(alvo?.diagnosis.join(" ")).toContain("desta Setorial")
	})

	it("atribui a inconsistência à mesma UG independentemente da ordem das linhas", () => {
		// `Set` preserva ordem de inserção: sem ordenação, quem respondia pelo achado
		// mudava conforme a planilha viesse ordenada de um jeito ou de outro.
		const linhas = [rec("120075", CONTA_RESPONSABILIDADE, "CC1", 100), rec("120062", CONTA_RESPONSABILIDADE, "CC1", 100)]
		const direto = analyzeData(linhas).ranking[0].ug
		const invertido = analyzeData([...linhas].reverse()).ranking[0].ug
		expect(direto).toBe(invertido)
		expect(direto).toBe("120062")
	})

	// A STN não é UG acompanhada, mas é a contraparte do lançamento. Tirar só a linha
	// dela deixaria o lado do COMAER sozinho e viraria uma cobrança sem correção
	// possível — o conta corrente inteiro sai.
	it("descarta o conta corrente inteiro quando uma das pernas é da STN", () => {
		const records = [
			rec("170999", CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 500),
			rec("120062", CONTA_RESPONSABILIDADE, "CC1", 500),
			rec("170999", CONTA_RESPONSABILIDADE, "CC2", 800),
		]
		const { ugAnalysis, stats } = analyzeData(records)
		expect(statusDe(records, "CC1")).toBeUndefined()
		expect(statusDe(records, "CC2")).toBeUndefined()
		expect(ugAnalysis.some((u) => u.ug === "170999")).toBe(false)
		expect(stats.totalUgs).toBe(0)
	})

	// A planilha de origem traz várias contas na mesma extração. Uma linha da STN em
	// conta que não é do par não pode derrubar o par que compartilha o conta corrente.
	it("só exclui pela linha da STN que esteja numa das contas do par", () => {
		const records = [
			rec("170999", "123119905", "CC1", 100),
			rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 500),
			rec("120062", CONTA_RESPONSABILIDADE, "CC1", 400),
		]
		expect(statusDe(records, "CC1")).toBe("DIVERGÊNCIA DE SALDO")
	})

	it("não deixa a exclusão da STN alcançar conta corrente só do COMAER", () => {
		const records = [rec("170999", CONTA_RESPONSABILIDADE, "CC1", 100), rec("120062", CONTA_RESPONSABILIDADE, "CC2", 900)]
		expect(statusDe(records, "CC2")).toBe("AUSÊNCIA NA 897210300")
	})

	it("ordena o ranking por impacto financeiro e resume o achado", () => {
		const records = [
			rec("120062", CONTA_RESPONSABILIDADE, "CC1", 100),
			rec("120075", CONTA_RESPONSABILIDADE, "CC2", 900),
			rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC3", 50),
		]
		const { ranking, stats } = analyzeData(records)
		expect(ranking[0].ug).toBe("120075")
		expect(stats.ugsCriticas).toBe(3)
		expect(stats.synthesis).toContain("120075")
	})
})

describe("parseSaldoCell", () => {
	it("lê o valor cru: número direto, texto na convenção brasileira", () => {
		expect(parseSaldoCell(123.456)).toBe(123.456)
		expect(parseSaldoCell("1.234,56")).toBe(1234.56)
		// Vírgula sozinha é decimal: a regra anterior lia "1,234" como mil duzentos e trinta e quatro.
		expect(parseSaldoCell("1,234")).toBe(1.234)
		expect(parseSaldoCell("(1.234,56)")).toBe(-1234.56)
		expect(parseSaldoCell("")).toBe(0)
		expect(parseSaldoCell("abc")).toBe(0)
	})
})

type SheetLine = [ug: string, conta: string, contaCorrente: string | number, saldo: string | number, formato?: string]

/**
 * Planilha xlsx de verdade, escrita e relida pelo SheetJS. O quinto campo é o formato
 * da célula de saldo; conta corrente numérica leva o formato "00000".
 */
function buildWorkbook(lines: SheetLine[]): Uint8Array {
	const sheet = XLSX.utils.aoa_to_sheet([
		["Relatório Tesouro Gerencial"],
		["UG", "Conta Contábil", "Conta Corrente", "Saldo - R$"],
		...lines.map((line) => line.slice(0, 4)),
	])
	lines.forEach(([, , contaCorrente, , format], index) => {
		if (format) sheet[XLSX.utils.encode_cell({ r: index + 2, c: 3 })].z = format
		if (typeof contaCorrente === "number") sheet[XLSX.utils.encode_cell({ r: index + 2, c: 2 })].z = "00000"
	})
	const book = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(book, sheet, "Relatório")
	return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }))
}

describe("readRecords (xlsx real)", () => {
	it("lê o saldo cru, sem passar pelo texto em inglês do SheetJS", () => {
		const records = readRecords(
			buildWorkbook([
				// Célula Geral: o SheetJS formataria "123.456", que pela regra brasileira é 123456.
				["120052", CONTA_EXECUCAO_RESPONSABILIDADE, 42, 123.456],
				// "#,##0.00": formatado sairia "1,234,567.89".
				["120052", CONTA_EXECUCAO_RESPONSABILIDADE, "CC2", 1234567.891, "#,##0.00"],
				// Texto digitado no padrão brasileiro.
				["120062", CONTA_RESPONSABILIDADE, "CC3", "1.234,56"],
				["120062", CONTA_RESPONSABILIDADE, "CC4", "(1.234,56)"],
			])
		)
		expect(records.map((r) => r.Saldo)).toEqual([123.456, 1234567.891, 1234.56, -1234.56])
		// Os identificadores seguem como texto formatado: o zero à esquerda do formato "00000" fica.
		expect(records[0]).toMatchObject({ UG: "120052", ContaContabil: CONTA_EXECUCAO_RESPONSABILIDADE, ContaCorrente: "00042" })
	})

	it("mantém as linhas alinhadas com linha vazia no meio", () => {
		const sheet = XLSX.utils.aoa_to_sheet([
			["UG", "Conta Contábil", "Conta Corrente", "Saldo"],
			["120052", CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 10],
			[],
			["120062", CONTA_RESPONSABILIDADE, "CC2", 20],
		])
		const book = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(book, sheet, "a")
		const records = readRecords(new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" })))
		expect(records.map((r) => [r.ContaCorrente, r.Saldo])).toEqual([
			["CC1", 10],
			["CC2", 20],
		])
	})

	it("CSV brasileiro não passa pela adivinhação de número do SheetJS", () => {
		// Sem acento no cabeçalho: CSV em UTF-8 sem BOM o SheetJS decodifica como Latin-1.
		const csv = "UG;Conta Contabil;Conta Corrente;Saldo\n120052;897210300;CC1;1.234,56\n120052;897210300;CC2;1.234\n120052;897210300;CC3;12,345\n"
		const records = readRecords(new TextEncoder().encode(csv))
		expect(records.map((r) => r.Saldo)).toEqual([1234.56, 1234, 12.345])
	})
})
