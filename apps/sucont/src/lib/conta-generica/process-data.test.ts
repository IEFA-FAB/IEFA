import { describe, expect, it } from "bun:test"
import * as XLSX from "xlsx"
import { processData, readWorkbookRows } from "#/lib/conta-generica/process-data"

const HEADER_ERROR = "Não foi possível encontrar o cabeçalho da tabela com as colunas: UG, Conta Contábil, Mês, Saldo - R$. Verifique o formato do arquivo."

/** Workbook em memória, serializado como o `FileReader` entrega (`readAsArrayBuffer`). */
function workbookBuffer(rows: unknown[][]): ArrayBuffer {
	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Relatório")
	XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["ignorada"]]), "Outra")
	return XLSX.write(wb, { type: "array", bookType: "xlsx" })
}

describe("readWorkbookRows", () => {
	it("lê só a primeira aba, linha a linha", () => {
		const rows = readWorkbookRows(workbookBuffer([["Título"], ["UG", "Conta Contábil"]]))
		expect(rows).toEqual([["Título"], ["UG", "Conta Contábil"]])
	})

	it("lança quando não há arquivo (o componente mostra a mensagem de Excel inválido)", () => {
		expect(() => readWorkbookRows(undefined)).toThrow()
	})
})

describe("processData", () => {
	it("recusa planilha vazia com a mensagem do cabeçalho", () => {
		expect(processData([])).toEqual({ error: HEADER_ERROR })
	})

	it("recusa quando falta uma das quatro colunas", () => {
		expect(processData([["UG", "Conta Contábil", "Mês"]])).toEqual({ error: HEADER_ERROR })
		expect(processData([["UG", "Conta Contábil", "Saldo"]])).toEqual({ error: HEADER_ERROR })
		expect(processData([["UG", "Mês", "Saldo"]])).toEqual({ error: HEADER_ERROR })
		expect(processData([["Conta Contábil", "Mês", "Saldo"]])).toEqual({ error: HEADER_ERROR })
	})

	it("pula linha que não é array ao procurar o cabeçalho", () => {
		const data = [null, "texto", ["UG", "Conta Contábil", "Mês", "Saldo - R$"], ["120001", "1.1.1.99", "JAN", 10]] as unknown[][]
		expect(processData(data)).toEqual({ grouped: { "120001": { "11199": [{ mes: "JAN", saldo: 10 }] } }, hasGeneric: true })
	})

	it("acha o cabeçalho abaixo do título, sem diferenciar caixa e espaço nas pontas", () => {
		const rows = readWorkbookRows(
			workbookBuffer([
				["Relatório do Tesouro Gerencial"],
				[0, null, ""],
				["  ug ", " CONTA CONTÁBIL ", "Mês", "Saldo - R$"],
				["120001", "11199", "JAN/2026", 5],
			])
		)
		expect(processData(rows)).toEqual({ grouped: { "120001": { "11199": [{ mes: "JAN/2026", saldo: 5 }] } }, hasGeneric: true })
	})

	it.each([
		["Conta Contabil", "Mes", "Saldo - R $"],
		["Conta Contábil", "Conta Corrente", "Valor Alongado"],
		["conta contábil", "mês", "saldo"],
	])("aceita a variação de cabeçalho %s / %s / %s", (conta, mes, saldo) => {
		const data = [
			["UG", conta, mes, saldo],
			["120001", "11199", "001", 7],
		]
		expect(processData(data)).toEqual({ grouped: { "120001": { "11199": [{ mes: "001", saldo: 7 }] } }, hasGeneric: true })
	})

	it("usa o primeiro cabeçalho completo e lê as colunas na ordem em que aparecem", () => {
		const data = [
			["Saldo", "Mês", "Extra", "Conta Contábil", "UG"],
			[3, "MAR", "x", "21299", "120006"],
			// A segunda linha de cabeçalho é lida como dado; sem a 5ª coluna (UG), cai fora.
			["UG", "Conta Contábil", "Mês", "Saldo"],
			["120001", "11199", "JAN", 1, "120004"],
		]
		expect(processData(data)).toEqual({
			grouped: {
				"120006": { "21299": [{ mes: "MAR", saldo: 3 }] },
				"120004": { "1": [{ mes: "11199", saldo: 120001 }] },
			},
			hasGeneric: true,
		})
	})

	it("agrupa por UG e conta, normaliza a conta e converte saldo numérico e textual", () => {
		const rows = readWorkbookRows(
			workbookBuffer([
				["UG", "Conta Contábil", "Mês", "Saldo - R$"],
				[" 120001 ", "1.1.1. 99", " JAN ", 1234.56],
				["120001", "11199", "FEV", "1.234,56"],
				["120001", "2.1.2.99", "JAN", "-10,5"],
				["120006", "11199", "MAR", -3],
				[120007, 31199, "ABR", 2],
			])
		)
		expect(processData(rows)).toEqual({
			grouped: {
				"120001": {
					"11199": [
						{ mes: "JAN", saldo: 1234.56 },
						{ mes: "FEV", saldo: 1234.56 },
					],
					"21299": [{ mes: "JAN", saldo: -10.5 }],
				},
				"120006": { "11199": [{ mes: "MAR", saldo: -3 }] },
				"120007": { "31199": [{ mes: "ABR", saldo: 2 }] },
			},
			hasGeneric: true,
		})
	})

	it("ignora linha vazia, célula ausente, UG ou conta vazias, saldo zero ou ilegível", () => {
		const data = [
			["UG", "Conta Contábil", "Mês", "Saldo"],
			[],
			"não é linha",
			["120001", "11199", "JAN"],
			[null, "11199", "JAN", 1],
			["120001", null, "JAN", 1],
			["120001", "11199", null, 1],
			["120001", "11199", "JAN", null],
			["", "11199", "JAN", 1],
			["120001", "", "JAN", 1],
			["120001", "11199", "JAN", 0],
			["120001", "11199", "JAN", "0,00"],
			["120001", "11199", "JAN", "abc"],
		] as unknown[][]
		expect(processData(data)).toEqual({ grouped: {}, hasGeneric: false })
	})

	it("aceita mês vazio (só UG e conta vazias derrubam a linha)", () => {
		const data = [
			["UG", "Conta Contábil", "Mês", "Saldo"],
			["120001", "11199", "", 1],
		]
		expect(processData(data)).toEqual({ grouped: { "120001": { "11199": [{ mes: "", saldo: 1 }] } }, hasGeneric: true })
	})

	it("conta que vira vazia depois de tirar espaço e ponto não entra nem marca achado", () => {
		const data = [
			["UG", "Conta Contábil", "Mês", "Saldo"],
			["120001", " . ", "JAN", 1],
		]
		expect(processData(data)).toEqual({ grouped: {}, hasGeneric: false })
	})

	it("não filtra pelo final 99: qualquer conta com saldo entra", () => {
		const data = [
			["UG", "Conta Contábil", "Mês", "Saldo"],
			["120001", "11101", "JAN", 1],
		]
		expect(processData(data)).toEqual({ grouped: { "120001": { "11101": [{ mes: "JAN", saldo: 1 }] } }, hasGeneric: true })
	})
})
