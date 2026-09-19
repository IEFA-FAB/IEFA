import { describe, expect, test } from "bun:test"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import * as XLSX from "xlsx"
import { SiafiParseError } from "./parse.ts"
import { MAX_SIAFI_COLUMNS, MAX_SIAFI_ROWS, MAX_XLSX_ENTRY_BYTES, parseCsv, parseXlsx, readSiafiFile } from "./read-file.ts"

const HEADER = ["Documento", "Valor", "UG"]

function workbookBytes(rows: unknown[][]): Uint8Array {
	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Relatorio")
	return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer)
}

/** Reescreve o XML da primeira planilha dentro do zip — é assim que o arquivo hostil é feito. */
function patchSheetXml(bytes: Uint8Array, patch: (xml: string) => string): Uint8Array {
	const files = unzipSync(bytes)
	const sheetPath = Object.keys(files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
	if (!sheetPath) throw new Error("planilha não encontrada no fixture")
	files[sheetPath] = strToU8(patch(strFromU8(files[sheetPath] as Uint8Array)))
	return zipSync(files, { level: 9 })
}

/** Reescreve o tamanho descompactado DECLARADO de todas as entradas no diretório central. */
function declareUncompressedSize(zip: Uint8Array, size: number): Uint8Array {
	const patched = zip.slice()
	const view = new DataView(patched.buffer)
	for (let offset = 0; offset + 4 <= patched.length; offset++) {
		if (view.getUint32(offset, true) === 0x02014b50) view.setUint32(offset + 24, size, true)
	}
	return patched
}

function expectParseError(run: () => unknown, message: RegExp) {
	let caught: unknown
	try {
		run()
	} catch (err) {
		caught = err
	}
	expect(caught).toBeInstanceOf(SiafiParseError)
	expect((caught as Error).message).toMatch(message)
}

describe("parseXlsx — leitura", () => {
	test("lê a primeira planilha a partir da linha de cabeçalho", () => {
		const bytes = workbookBytes([["Relatório de NE"], HEADER, ["2026NE000001", "1.234,56", "120001"]])
		expect(readSiafiFile(bytes, "relatorio.xlsx")).toEqual([{ Documento: "2026NE000001", Valor: "1.234,56", UG: "120001" }])
	})
})

describe("parseXlsx — entrada hostil", () => {
	test("<dimension> forjado (A1:Z1048576) não expande a matriz: a extensão sai das células", () => {
		const forged = patchSheetXml(workbookBytes([HEADER, ["2026NE000001", "10", "120001"]]), (xml) =>
			xml.replace(/<dimension ref="[^"]*"\s*\/>/, '<dimension ref="A1:Z1048576"/>')
		)
		// Pré-condição: o fixture tem de fato o dimension forjado, e é pequeno.
		expect(strFromU8(Object.values(unzipSync(forged, { filter: (f) => f.name.includes("worksheets/") }))[0] as Uint8Array)).toContain(
			'<dimension ref="A1:Z1048576"/>'
		)
		expect(forged.length).toBeLessThan(16 * 1024)

		const rssBefore = process.memoryUsage().rss
		const startedAt = performance.now()
		const rows = parseXlsx(forged)
		expect(performance.now() - startedAt).toBeLessThan(2_000)
		expect(rows).toEqual([{ Documento: "2026NE000001", Valor: "10", UG: "120001" }])
		// Antes: ~676 MB de RSS a mais. Folga larga para o ruído do GC.
		expect(process.memoryUsage().rss - rssBefore).toBeLessThan(100 * 1024 * 1024)
	})

	test("planilha que passa do teto de linhas é 422 — a leitura para uma linha depois dele", () => {
		const row = MAX_SIAFI_ROWS + 1
		const bytes = patchSheetXml(workbookBytes([HEADER, ["a", "1", "2"]]), (xml) =>
			xml.replace("</sheetData>", `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>x</t></is></c></row></sheetData>`)
		)
		expectParseError(() => parseXlsx(bytes), /linhas/)
	})

	test("célula isolada na última linha da planilha não vira uma matriz de um milhão de linhas", () => {
		const bytes = patchSheetXml(workbookBytes([HEADER, ["a", "1", "2"]]), (xml) =>
			xml.replace("</sheetData>", `<row r="1048576"><c r="A1048576" t="inlineStr"><is><t>x</t></is></c></row></sheetData>`)
		)
		const startedAt = performance.now()
		// Linha além do teto nem é lida: sobra o conteúdo real, sem a matriz intermediária.
		expect(parseXlsx(bytes)).toEqual([{ Documento: "a", Valor: "1", UG: "2" }])
		expect(performance.now() - startedAt).toBeLessThan(2_000)
	})

	test("célula real além do teto de colunas é 422", () => {
		const bytes = patchSheetXml(workbookBytes([HEADER, ["a", "1", "2"]]), (xml) =>
			xml.replace("</sheetData>", `<row r="3"><c r="XFD3" t="inlineStr"><is><t>x</t></is></c></row></sheetData>`)
		)
		expectParseError(() => parseXlsx(bytes), /colunas/)
	})

	test("zip que declara conteúdo descompactado acima do teto é recusado antes de alocar", () => {
		const bomb = declareUncompressedSize(workbookBytes([HEADER, ["a", "1", "2"]]), MAX_XLSX_ENTRY_BYTES + 1)
		expectParseError(() => parseXlsx(bomb), /grande demais/)
	})

	test("lixo com extensão .xlsx é 422, não 500", () => {
		expectParseError(() => readSiafiFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...strToU8("não é zip")]), "relatorio.xlsx"), /inválido/)
	})
})

describe("parseCsv — tetos", () => {
	test("linhas acima do teto são 422 antes de dividir as células", () => {
		expectParseError(() => parseCsv(`${HEADER.join(";")}\n${"\n".repeat(MAX_SIAFI_ROWS + 1)}`), /linhas/)
	})

	test("colunas acima do teto são 422", () => {
		expectParseError(() => parseCsv(`${HEADER.join(";")}\n${";".repeat(MAX_SIAFI_COLUMNS)}`), /colunas/)
	})

	test("CSV comum segue lido", () => {
		expect(parseCsv("Documento;Valor;UG\n2026NE000001;10;120001\n")).toEqual([{ Documento: "2026NE000001", Valor: "10", UG: "120001" }])
	})
})
