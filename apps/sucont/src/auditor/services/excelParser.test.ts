/**
 * Caracterização do `parseExcelFile` (port do SIAFI-x-SILOMS-Auditor).
 *
 * Trava o comportamento do mapeamento de colunas — detecção do cabeçalho,
 * deslocamento de coluna, data herdada, defaults e conversão numérica — inclusive
 * as esquisitices de origem que seguem, marcadas como tal. Mudar um destes testes é
 * mudar o parser, não refatorá-lo.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { utils, write } from "xlsx"
import type { RawInputRow } from "../types"
import { parseExcelFile } from "./excelParser"

type Cell = string | number | boolean | Date | null

// ── FileReader controlável ────────────────────────────────────────────────────
// O bun não tem FileReader. O stub cobre exatamente o que o parser chama e deixa
// forçar resultado vazio e erro de leitura.

type ReaderMode = "load" | "empty" | "error"
let readerMode: ReaderMode = "load"
const READ_ERROR = new Error("falha de leitura simulada")

class StubFileReader {
	onload: ((event: { target: { result: unknown } }) => void) | null = null
	onerror: ((error: unknown) => void) | null = null
	readAsArrayBuffer(blob: Blob) {
		if (readerMode === "error") {
			queueMicrotask(() => this.onerror?.(READ_ERROR))
			return
		}
		if (readerMode === "empty") {
			queueMicrotask(() => this.onload?.({ target: { result: null } }))
			return
		}
		blob.arrayBuffer().then((ab) => this.onload?.({ target: { result: new Uint8Array(ab) } }))
	}
}

const globalWithReader = globalThis as { FileReader?: unknown }
let previousReader: unknown

beforeAll(() => {
	previousReader = globalWithReader.FileReader
	globalWithReader.FileReader = StubFileReader
})

afterAll(() => {
	globalWithReader.FileReader = previousReader
})

// ── Planilha em memória ───────────────────────────────────────────────────────

const toFile = (aoa: Cell[][]): File => {
	const sheet = utils.aoa_to_sheet(aoa, { cellDates: true })
	const book = utils.book_new()
	utils.book_append_sheet(book, sheet, "relatório")
	const buffer = write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer
	return new File([buffer], "x.xlsx")
}

const parseAoa = async (aoa: Cell[][]): Promise<RawInputRow[]> => {
	readerMode = "load"
	return parseExcelFile(toFile(aoa))
}

const HEADER: Cell[] = [
	"MÊS",
	"COD",
	"UG",
	"GRUPO CONSUMO",
	"SIAFI",
	"SILOMS",
	"DIF",
	"GRUPO BMP",
	"SIAFI",
	"SILOMS",
	"DIF",
	"GRUPO INTANG",
	"SIAFI",
	"SILOMS",
	"DIF",
]

/** Linha no leiaute padrão (offset 0): data, cod, ug e os três grupos de 4 colunas. */
const dataRow = (date: Cell, cod: Cell, ug: Cell, n: Cell[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]): Cell[] => [
	date,
	cod,
	ug,
	"CONSUMO",
	n[0],
	n[1],
	n[2],
	"BMP",
	n[3],
	n[4],
	n[5],
	"INTANGÍVEL",
	n[6],
	n[7],
	n[8],
]

const values = (r: RawInputRow) => [r.g1_siafi, r.g1_siloms, r.g1_diff, r.g2_siafi, r.g2_siloms, r.g2_diff, r.g3_siafi, r.g3_siloms, r.g3_diff]

describe("parseExcelFile — leitura do arquivo", () => {
	it("rejeita com 'File content is empty' quando o FileReader não devolve conteúdo", async () => {
		readerMode = "empty"
		await expect(parseExcelFile(new File([], "vazio.xlsx"))).rejects.toThrow("File content is empty")
	})

	it("rejeita com o erro do FileReader quando a leitura falha", async () => {
		readerMode = "error"
		await expect(parseExcelFile(new File([], "x.xlsx"))).rejects.toBe(READ_ERROR)
	})

	it("planilha sem linha de dado devolve lista vazia", async () => {
		expect(await parseAoa([[null]])).toEqual([])
	})

	it("planilha de uma coluna só não tem COD nem UG e devolve lista vazia", async () => {
		expect(await parseAoa([["JAN/2024"], ["120001"], ["ALFA"]])).toEqual([])
	})
})

describe("parseExcelFile — mapeamento de colunas (leiaute padrão)", () => {
	it("mapeia data, cod, ug, os três grupos e os nomes fixos", async () => {
		const rows = await parseAoa([HEADER, dataRow("JANEIRO/2024", 120001, "ALFA", [10, 20, 30, 40, 50, 60, 70, 80, 90])])
		expect(rows).toEqual([
			{
				data: "JANEIRO/2024",
				cod: "120001",
				ug: "ALFA",
				g1_name: "CONSUMO",
				g1_siafi: 10,
				g1_siloms: 20,
				g1_diff: 30,
				g2_name: "BMP",
				g2_siafi: 40,
				g2_siloms: 50,
				g2_diff: 60,
				g3_name: "INTANGIVEL",
				g3_siafi: 70,
				g3_siloms: 80,
				g3_diff: 90,
			},
		])
	})

	it("apara espaços de cod, ug e data", async () => {
		const [row] = await parseAoa([HEADER, dataRow("  JAN/2024  ", " 120001 ", "  ALFA ")])
		expect(row.data).toBe("JAN/2024")
		expect(row.cod).toBe("120001")
		expect(row.ug).toBe("ALFA")
	})
})

describe("parseExcelFile — detecção do cabeçalho", () => {
	for (const label of ["DATA", "data", " Data ", "MÊS", "MÊS/ANO", "REF", "COMPETÊNCIA REF.", "PERÍODO"]) {
		it(`cabeçalho '${label}' na coluna 0: começa na linha seguinte, sem deslocamento`, async () => {
			const rows = await parseAoa([["RELATÓRIO SIAFI x SILOMS", null], [label, "COD", "UG"], dataRow("JAN/2024", 120001, "ALFA")])
			expect(rows).toHaveLength(1)
			expect(rows[0].cod).toBe("120001")
			expect(rows[0].ug).toBe("ALFA")
			expect(values(rows[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
		})
	}

	it("'DATAS' não é o cabeçalho 'DATA' (comparação exata)", async () => {
		// Sem cabeçalho reconhecido o parser começa na linha 1 e lê o próprio
		// cabeçalho como dado.
		const rows = await parseAoa([["DATAS", "COD", "UG"], dataRow(null, 120001, "ALFA")])
		expect(rows.map((r) => r.cod)).toEqual(["120001"])
		const rows2 = await parseAoa([["TÍTULO", null], ["DATAS", "COD", "UG"], dataRow(null, 120001, "ALFA")])
		expect(rows2.map((r) => r.cod)).toEqual(["COD", "120001"])
	})

	for (const label of ["COD", "CÓD", "UG", "cod"]) {
		it(`cabeçalho '${label}' na coluna 0: colunas deslocadas uma posição para a esquerda`, async () => {
			const rows = await parseAoa([
				[label, "UG", "CONSUMO", "SIAFI", "SILOMS", "DIF", "BMP", "SIAFI", "SILOMS", "DIF", "INTANG", "SIAFI", "SILOMS", "DIF"],
				[120001, "ALFA", "CONSUMO", 1, 2, 3, "BMP", 4, 5, 6, "INTANGÍVEL", 7, 8, 9],
			])
			expect(rows).toHaveLength(1)
			expect(rows[0].cod).toBe("120001")
			expect(rows[0].ug).toBe("ALFA")
			expect(values(rows[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
			// Sem coluna de data, a coluna 0 é o COD e não vira competência (o port a
			// lia, e o COD de 6 caracteres passava no teste de "parece data").
			expect(rows[0].data).toBe("DATA_DESCONHECIDA")
		})
	}

	it("sem coluna de data, a competência é a da varredura inicial, não o COD", async () => {
		const rows = await parseAoa([
			["RELATÓRIO", "Posição em 31/12/2024"],
			["COD", "UG", "CONSUMO", "SIAFI", "SILOMS", "DIF"],
			[120001, "ALFA", "CONSUMO", 1, 2, 3],
			["120002", "BRAVO", "CONSUMO", 4, 5, 6],
		])
		expect(rows.map((r) => [r.data, r.cod])).toEqual([
			["Posição em 31/12/2024", "120001"],
			["Posição em 31/12/2024", "120002"],
		])
	})

	it("sem cabeçalho, linha cuja coluna 0 tem '/' e dígito é a primeira de dado", async () => {
		const rows = await parseAoa([dataRow("JAN/2024", 120001, "ALFA"), dataRow("FEV/2024", 120002, "BRAVO")])
		expect(rows.map((r) => [r.data, r.cod])).toEqual([
			["JAN/2024", "120001"],
			["FEV/2024", "120002"],
		])
	})

	it("sem cabeçalho, linha cuja coluna 0 tem 6 dígitos é a primeira de dado", async () => {
		const rows = await parseAoa([["TÍTULO", null], dataRow(120001, 120001, "ALFA"), dataRow(120002, 120002, "BRAVO")])
		expect(rows.map((r) => [r.data, r.cod])).toEqual([
			["120001", "120001"],
			["120002", "120002"],
		])
	})

	it("'/' sem dígito e 6 caracteres não numéricos não marcam início", async () => {
		// Nenhuma linha reconhecida → começa na linha 1 (a linha 0 é descartada).
		const rows = await parseAoa([dataRow("A/B", "X0", "U0"), dataRow("ABCDEF", "X1", "U1"), dataRow("ABCDEF", "X2", "U2")])
		expect(rows.map((r) => r.cod)).toEqual(["X1", "X2"])
	})

	it("cabeçalho depois da linha 30 não é procurado: começa na linha 1 e lê o cabeçalho como dado", async () => {
		const filler: Cell[][] = Array.from({ length: 30 }, () => ["LINHA", null])
		const rows = await parseAoa([...filler, ["DATA", "COD", "UG", null, "SIAFI"], dataRow("JAN/2024", 120001, "ALFA")])
		// A competência do cabeçalho-lido-como-dado vem da varredura inicial, que
		// acha "JAN/2024" na linha seguinte.
		expect(rows.map((r) => [r.data, r.cod, r.ug])).toEqual([
			["JAN/2024", "COD", "UG"],
			["JAN/2024", "120001", "ALFA"],
		])
		expect(rows[0].g1_siafi).toBe(0)
	})

	it("a primeira regra que casa na linha vence, na ordem DATA → COD → '/'", async () => {
		// "REF 01/2024" casa REF antes do teste de '/': começa na linha seguinte.
		const rows = await parseAoa([dataRow("REF 01/2024", "X0", "U0"), dataRow("JAN/2024", 120001, "ALFA")])
		expect(rows.map((r) => r.cod)).toEqual(["120001"])
	})

	it("coluna 0 zerada conta como vazia na detecção", async () => {
		const rows = await parseAoa([[0, "X"], ["DATA", "COD"], dataRow("JAN/2024", 120001, "ALFA")])
		expect(rows.map((r) => r.cod)).toEqual(["120001"])
	})
})

describe("parseExcelFile — competência da linha", () => {
	it("linha sem data herda a competência da linha anterior", async () => {
		const rows = await parseAoa([
			HEADER,
			dataRow("JAN/2024", 120001, "ALFA"),
			dataRow(null, 120002, "BRAVO"),
			dataRow("FEV/2024", 120001, "ALFA"),
			dataRow("", 120002, "BRAVO"),
		])
		expect(rows.map((r) => r.data)).toEqual(["JAN/2024", "JAN/2024", "FEV/2024", "FEV/2024"])
	})

	it("só troca a competência por texto com separador ou com mais de 5 caracteres", async () => {
		const rows = await parseAoa([
			HEADER,
			dataRow("JAN/2024", "C1", "U"),
			dataRow("AB", "C2", "U"), // < 3 caracteres: ignora
			dataRow("ABCD", "C3", "U"), // 4 caracteres sem separador: ignora
			dataRow("ABCDE", "C4", "U"), // 5 caracteres sem separador: ignora
			dataRow("ABCDEF", "C5", "U"), // > 5: troca
			dataRow("A-B", "C6", "U"), // '-': troca
			dataRow("A B", "C7", "U"), // espaço: troca
			dataRow("A/B", "C8", "U"), // '/': troca
		])
		expect(rows.map((r) => r.data)).toEqual(["JAN/2024", "JAN/2024", "JAN/2024", "JAN/2024", "ABCDEF", "A-B", "A B", "A/B"])
	})

	it("linha pulada por falta de COD e UG ainda atualiza a competência", async () => {
		const rows = await parseAoa([HEADER, dataRow("JAN/2024", 120001, "ALFA"), dataRow("FEV/2024", null, null), dataRow(null, 120002, "BRAVO")])
		expect(rows.map((r) => r.data)).toEqual(["JAN/2024", "FEV/2024"])
	})

	it("célula de data vira ISO", async () => {
		const date = new Date(2025, 0, 15, 12)
		const [row] = await parseAoa([HEADER, dataRow(date, 120001, "ALFA")])
		expect(row.data).toBe(date.toISOString())
	})

	it("sem nenhuma competência no arquivo, a linha leva DATA_DESCONHECIDA", async () => {
		const [row] = await parseAoa([HEADER, dataRow(null, 120001, "ALFA")])
		expect(row.data).toBe("DATA_DESCONHECIDA")
	})
})

describe("parseExcelFile — competência inicial (varredura das 100 primeiras linhas)", () => {
	const firstRowData = async (title: Cell[]) => {
		const rows = await parseAoa([title, HEADER, dataRow(null, 120001, "ALFA")])
		return rows[0].data
	}

	it("texto com '/' e dígito", async () => {
		expect(await firstRowData(["Posição em 31/12/2024", null])).toBe("Posição em 31/12/2024")
	})

	it("texto com '-' e dígito", async () => {
		expect(await firstRowData(["2024-12", null])).toBe("2024-12")
	})

	it("texto com espaço e dígito", async () => {
		expect(await firstRowData(["DEZ 2024", null])).toBe("DEZ 2024")
	})

	for (const label of [
		"JAN2024",
		"fev2025",
		"MAR2023",
		"ABR2024",
		"MAI2024",
		"JUN2024",
		"JUL2024",
		"AGO2024",
		"SET2025",
		"OUT2024",
		"NOV2024",
		"DEZ2024",
		"MARÇO2024",
	]) {
		it(`mês colado ao ano: ${label}`, async () => {
			expect(await firstRowData([label, null])).toBe(label)
		})
	}

	it("palavra com as letras de um mês mas sem o ano colado não conta", async () => {
		// O port só aceitava JAN/FEV/MAR/ABR/SET, e em qualquer lugar do texto.
		expect(await firstRowData(["SETOR2O24", null])).toBe("DATA_DESCONHECIDA")
		expect(await firstRowData(["CONSOLIDADO", null])).toBe("DATA_DESCONHECIDA")
	})

	it("texto sem dígito e número sem separador não contam", async () => {
		expect(await firstRowData(["RELATÓRIO / SIAFI", 2024])).toBe("DATA_DESCONHECIDA")
	})

	it("número negativo, em célula numérica ou em texto, não é competência", async () => {
		// O port achava o traço do sinal e tomava -100 como competência inicial.
		expect(await firstRowData(["TÍTULO", -100])).toBe("DATA_DESCONHECIDA")
		expect(await firstRowData(["TÍTULO", "-100"])).toBe("DATA_DESCONHECIDA")
		expect(await firstRowData(["TÍTULO", "R$ -50,5"])).toBe("DATA_DESCONHECIDA")
		expect(await firstRowData(["-1.234,56", "2024-12"])).toBe("2024-12")
	})

	it("célula de data conta pela forma textual do Date", async () => {
		const date = new Date(2024, 11, 1, 12)
		expect(await firstRowData([date, null])).toBe(String(date))
	})

	it("vence a primeira célula que casa, na ordem de leitura", async () => {
		expect(await firstRowData(["TÍTULO", "JAN/2024", "FEV/2024"])).toBe("JAN/2024")
	})

	it("a competência inicial também pode vir de uma linha de dado", async () => {
		// Varre o arquivo inteiro (até 100 linhas), não só o que vem antes do cabeçalho.
		const rows = await parseAoa([HEADER, dataRow(null, 120001, "ALFA", [0, 0, 0, 0, 0, 0, 0, 0, 0]), dataRow("JAN/2024", 120002, "BRAVO")])
		// "GRUPO CONSUMO" do cabeçalho tem espaço mas não dígito; a primeira célula
		// que casa é "JAN/2024", na terceira linha.
		expect(rows.map((r) => r.data)).toEqual(["JAN/2024", "JAN/2024"])
	})
})

describe("parseExcelFile — COD e UG", () => {
	it("pula a linha sem COD e sem UG", async () => {
		const rows = await parseAoa([HEADER, dataRow("JAN/2024", null, null), dataRow("JAN/2024", "", "  "), dataRow("JAN/2024", 120001, "ALFA")])
		expect(rows.map((r) => r.cod)).toEqual(["120001"])
	})

	it("só UG: cod vira 000000", async () => {
		const [row] = await parseAoa([HEADER, dataRow("JAN/2024", null, "TOTAL")])
		expect(row.cod).toBe("000000")
		expect(row.ug).toBe("TOTAL")
	})

	it("só COD: ug vira UG_DESCONHECIDA", async () => {
		const [row] = await parseAoa([HEADER, dataRow("JAN/2024", 120001, null)])
		expect(row.cod).toBe("120001")
		expect(row.ug).toBe("UG_DESCONHECIDA")
	})

	it("COD zerado é texto '0', não vazio", async () => {
		const [row] = await parseAoa([HEADER, dataRow("JAN/2024", 0, null)])
		expect(row.cod).toBe("0")
	})
})

describe("parseExcelFile — conversão numérica", () => {
	it("número passa direto; vazio e zero viram 0", async () => {
		const [row] = await parseAoa([HEADER, dataRow("JAN/2024", 1, "U", [1.5, -2, 0, null, "", 3, 4, 5, 6])])
		expect(values(row)).toEqual([1.5, -2, 0, 0, 0, 3, 4, 5, 6])
	})

	it("texto em formato brasileiro vira número", async () => {
		const [row] = await parseAoa([HEADER, dataRow("JAN/2024", 1, "U", ["1.234,56", "R$ -50,5", "100", "abc", "-", "12,3,4", 0, 0, 0])])
		// "12,3,4" → "12.3,4": só a primeira vírgula vira ponto.
		expect(values(row)).toEqual([1234.56, -50.5, 100, 0, 0, 12.3, 0, 0, 0])
	})

	it("texto com ponto decimal, formato americano e parênteses segue a regra compartilhada", async () => {
		// O port tirava todo ponto: "1500.25" virava 150025 e "1,234.56" virava 1,23456.
		const [row] = await parseAoa([HEADER, dataRow("JAN/2024", 1, "U", ["1,234.56", "1500.25", "(1.234,56)", "1.234", "0.500", 0, 0, 0, 0])])
		expect(values(row).slice(0, 5)).toEqual([1234.56, 1500.25, -1234.56, 1234, 0.5])
	})

	it("booleano e data viram 0", async () => {
		const [row] = await parseAoa([HEADER, dataRow("JAN/2024", 1, "U", [true, false, new Date(2025, 0, 1, 12), 0, 0, 0, 0, 0, 0])])
		expect(values(row).slice(0, 3)).toEqual([0, 0, 0])
	})
})
