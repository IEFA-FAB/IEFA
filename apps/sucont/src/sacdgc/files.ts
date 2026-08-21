/**
 * @module sacdgc/files
 * Conversão dos arquivos enviados pelo usuário em fontes de texto para o parser.
 *
 * CSV é decodificado pelos bytes (o export do Tesouro Gerencial é windows-1252, e
 * lê-lo como UTF-8 corrompe todo acento antes de o dado chegar ao modelo). XLS/XLSX
 * passam pelo `xlsx`, uma aba por vez, com o nome da aba emitido antes das linhas —
 * é dele que o parser tira o painel quando o cabeçalho não o declara.
 */

import * as XLSX from "xlsx"
import { decodeSpreadsheet, type PanelSource } from "#/sacdgc/parser"

const SPREADSHEET = /\.(xlsx|xlsm|xls)$/i

/** Lê um arquivo enviado e devolve uma fonte por aba (planilha) ou uma única (CSV). */
async function readPanelSources(file: File): Promise<PanelSource[]> {
	const bytes = new Uint8Array(await file.arrayBuffer())

	if (!SPREADSHEET.test(file.name)) {
		return [{ name: file.name, text: decodeSpreadsheet(bytes) }]
	}

	const workbook = XLSX.read(bytes, { type: "array" })
	return workbook.SheetNames.map((sheetName) => {
		const sheet = workbook.Sheets[sheetName]
		const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ";" })
		return { name: `${file.name} — ${sheetName}`, text: `${sheetName}\n${csv}` }
	})
}

/** Lê todos os arquivos enviados, na ordem em que foram selecionados. */
export async function readAllPanelSources(files: File[]): Promise<PanelSource[]> {
	const perFile = await Promise.all(files.map(readPanelSources))
	return perFile.flat()
}
