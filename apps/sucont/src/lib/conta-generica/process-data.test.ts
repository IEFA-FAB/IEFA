import { describe, expect, it } from "bun:test"
import * as XLSX from "xlsx"
import { encodeWindows1252 } from "#/lib/__fixtures__/csv-encodings"
import { extractAccountCode, isGenericAccount, processData, readWorkbookRows } from "#/lib/conta-generica/process-data"

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

	it("lê CSV windows-1252 com o saldo como texto digitado", () => {
		const rows = readWorkbookRows(encodeWindows1252("UG;Conta Contábil;Mês;Saldo - R$\n120001;218810199;JAN;1.234,56\n"))
		expect(processData(rows)).toEqual({
			grouped: { "120001": { "218810199": [{ mes: "JAN", saldo: 1234.56 }] } },
			hasGeneric: true,
			skippedNonGeneric: 0,
		})
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
		expect(processData(data)).toEqual({ grouped: { "120001": { "11199": [{ mes: "JAN", saldo: 10 }] } }, hasGeneric: true, skippedNonGeneric: 0 })
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
		expect(processData(rows)).toEqual({ grouped: { "120001": { "11199": [{ mes: "JAN/2026", saldo: 5 }] } }, hasGeneric: true, skippedNonGeneric: 0 })
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
		expect(processData(data)).toEqual({ grouped: { "120001": { "11199": [{ mes: "001", saldo: 7 }] } }, hasGeneric: true, skippedNonGeneric: 0 })
	})

	it("usa o primeiro cabeçalho completo e lê as colunas na ordem em que aparecem", () => {
		const data = [
			["Saldo", "Mês", "Extra", "Conta Contábil", "UG"],
			[3, "MAR", "x", "21299", "120006"],
			// A segunda linha de cabeçalho é lida como dado; sem a 5ª coluna (UG), cai fora.
			["UG", "Conta Contábil", "Mês", "Saldo"],
			// Lida pelas colunas do cabeçalho, a conta sai "1": não é genérica e fica de fora.
			["120001", "11199", "JAN", 1, "120004"],
		]
		expect(processData(data)).toEqual({
			grouped: {
				"120006": { "21299": [{ mes: "MAR", saldo: 3 }] },
			},
			hasGeneric: true,
			skippedNonGeneric: 1,
		})
	})

	it("agrupa por UG e conta, normaliza a conta e converte saldo numérico e textual", () => {
		const rows = readWorkbookRows(
			workbookBuffer([
				["UG", "Conta Contábil", "Mês", "Saldo - R$"],
				[" 120001 ", " 1.1.1.99", " JAN ", 1234.56],
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
			skippedNonGeneric: 0,
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
		expect(processData(data)).toEqual({ grouped: {}, hasGeneric: false, skippedNonGeneric: 0 })
	})

	it("aceita mês vazio (só UG e conta vazias derrubam a linha)", () => {
		const data = [
			["UG", "Conta Contábil", "Mês", "Saldo"],
			["120001", "11199", "", 1],
		]
		expect(processData(data)).toEqual({ grouped: { "120001": { "11199": [{ mes: "", saldo: 1 }] } }, hasGeneric: true, skippedNonGeneric: 0 })
	})

	it("conta que vira vazia depois de tirar espaço e ponto não entra nem marca achado", () => {
		const data = [
			["UG", "Conta Contábil", "Mês", "Saldo"],
			["120001", " . ", "JAN", 1],
		]
		expect(processData(data)).toEqual({ grouped: {}, hasGeneric: false, skippedNonGeneric: 0 })
	})

	it("só entra conta genérica; as demais com saldo são contadas e ficam de fora", () => {
		const data = [
			["UG", "Conta Contábil", "Mês", "Saldo"],
			["120001", "11101", "JAN", 1],
			["120001", "2.1.8.8.1.01.99", "JAN", 2],
			["120001", "123119905", "JAN", 3],
			["120006", "113819900", "FEV", 4],
			["120006", "897211900", "FEV", 5],
		]
		expect(processData(data)).toEqual({
			grouped: {
				"120001": { "218810199": [{ mes: "JAN", saldo: 2 }] },
				"120006": { "113819900": [{ mes: "FEV", saldo: 4 }] },
			},
			hasGeneric: true,
			skippedNonGeneric: 3,
		})
	})

	it("lê o saldo pela regra compartilhada: ponto decimal fora do padrão de milhar e parênteses negativos", () => {
		const data = [
			["UG", "Conta Contábil", "Mês", "Saldo"],
			// O port lia "1500.25" como 150025 e "(1.234,56)" como NaN (a linha sumia).
			["120001", "11199", "JAN", "1500.25"],
			["120001", "11199", "FEV", "(1.234,56)"],
			["120001", "11199", "MAR", "R$ 1.234"],
		]
		expect(processData(data)).toEqual({
			grouped: {
				"120001": {
					"11199": [
						{ mes: "JAN", saldo: 1500.25 },
						{ mes: "FEV", saldo: -1234.56 },
						{ mes: "MAR", saldo: 1234 },
					],
				},
			},
			hasGeneric: true,
			skippedNonGeneric: 0,
		})
	})

	it("descarta a UG 170999 (STN), em código puro, com o nome, com ponto ou colada ao nome", () => {
		const data = [
			["UG", "Conta Contábil", "Mês", "Saldo"],
			["170999", "11199", "JAN", 1],
			["170999 - STN", "11199", "JAN", 2],
			["170.999", "11199", "JAN", 4],
			["170999STN", "11199", "JAN", 5],
			["120001", "11199", "JAN", 3],
		]
		expect(processData(data)).toEqual({ grouped: { "120001": { "11199": [{ mes: "JAN", saldo: 3 }] } }, hasGeneric: true, skippedNonGeneric: 0 })
	})

	it("relatório sem nenhuma conta genérica não marca achado", () => {
		const data = [
			["UG", "Conta Contábil", "Mês", "Saldo"],
			["120001", "11101", "JAN", 1],
		]
		expect(processData(data)).toEqual({ grouped: {}, hasGeneric: false, skippedNonGeneric: 1 })
	})
})

describe("extractAccountCode", () => {
	it.each([
		["2.1.8.8.1.01.99 - Outros Créditos", "218810199"],
		["218810199 OUTROS CRÉDITOS", "218810199"],
		["218810199-OUTROS", "218810199"],
		["218810199", "218810199"],
		// O código acaba no primeiro espaço: o dígito da descrição não entra.
		["218810199 13º SALARIO", "218810199"],
		["218810199 000001", "218810199"],
		["1.1.1. 99", "111"],
		[" 113819900 ", "113819900"],
		[" . ", ""],
		["CONTA X", "CONTAX"],
	])("%p → %p", (raw, expected) => {
		expect(extractAccountCode(raw)).toBe(expected)
	})

	it("conta com descrição entra na análise pelo código", () => {
		const data = [
			["UG", "Conta Contábil", "Mês", "Saldo"],
			["120001", "2.1.8.8.1.01.99 - Outros Créditos", "JAN", 5],
			["120001", "1.2.3.1.1.99.05 - Bens Móveis em Trânsito", "JAN", 6],
		]
		expect(processData(data)).toEqual({
			grouped: { "120001": { "218810199": [{ mes: "JAN", saldo: 5 }] } },
			hasGeneric: true,
			skippedNonGeneric: 1,
		})
	})

	it("descrição que começa por dígito não descarta a linha", () => {
		const data = [
			["UG", "Conta Contábil", "Mês", "Saldo"],
			["120001", "218810199 13º SALARIO", "JAN", 5],
			["120001", "218810199 000001", "FEV", 7],
		]
		expect(processData(data)).toEqual({
			grouped: {
				"120001": {
					"218810199": [
						{ mes: "JAN", saldo: 5 },
						{ mes: "FEV", saldo: 7 },
					],
				},
			},
			hasGeneric: true,
			skippedNonGeneric: 0,
		})
	})
})

describe("isGenericAccount", () => {
	it.each([
		["218810199", true], // subitem 99
		["113819900", true], // item 99 sem desdobramento
		["123119905", false], // item 99 com subitem próprio (bens móveis em trânsito)
		["123119901", false],
		["897211900", false],
		["115610100", false],
		["11199", true], // fora do formato de 9 dígitos: regra literal
		["11101", false],
	])("%s → %p", (conta, expected) => {
		expect(isGenericAccount(conta)).toBe(expected)
	})
})
