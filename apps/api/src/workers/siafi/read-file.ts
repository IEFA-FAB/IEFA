/**
 * Leitura do arquivo do Tesouro Gerencial (CSV ou XLSX) → array de objetos
 * cabeçalho→valor. Só I/O: a normalização e o mapa de sinônimos ficam em
 * `parse.ts` (puro e testável).
 *
 * O Tesouro Gerencial costuma exportar CSV em `;` e latin-1; XLSX vem com a
 * planilha única. Ambos podem trazer linhas de título antes do cabeçalho —
 * a detecção procura a primeira linha com ≥2 células não vazias que se pareça
 * com cabeçalho (texto, não número).
 */

import { unzipSync, zipSync } from "fflate"
import * as XLSX from "xlsx"
import { SiafiParseError } from "./parse.ts"

export type SiafiFileFormat = "csv" | "xlsx"

/**
 * Tetos da leitura. O arquivo vem do sisub em base64 e é lido INTEIRO na memória de um
 * container de 512 MB — e um `.xlsx` de 8,5 KB com `<dimension ref="A1:Z1048576"/>`
 * forjado virava, no `sheet_to_json({ defval: null })`, 1 milhão de linhas × 26 células
 * (676 MB de RSS): o processo morria antes de responder. Um relatório do Tesouro
 * Gerencial de uma unidade fica muito abaixo de qualquer um destes números.
 */
export const MAX_SIAFI_ROWS = 50_000
export const MAX_SIAFI_COLUMNS = 100

/**
 * Teto do conteúdo DESCOMPACTADO do `.xlsx`, por entrada e somado. Uma planilha de
 * 50 mil linhas × 15 colunas com strings inline dá ~29 MB de XML; com strings
 * compartilhadas (o que o Excel grava) bem menos.
 */
export const MAX_XLSX_ENTRY_BYTES = 48 * 1024 * 1024
export const MAX_XLSX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
export const MAX_XLSX_ENTRIES = 1_000

const TOO_MANY_ROWS = `O arquivo passa de ${MAX_SIAFI_ROWS.toLocaleString("pt-BR")} linhas — divida o relatório (por período ou unidade) e importe as partes.`
const TOO_MANY_COLUMNS = `O arquivo passa de ${MAX_SIAFI_COLUMNS} colunas — confira se é o relatório exportado do Tesouro Gerencial.`

/** Detecta o formato pelo nome do arquivo (fallback: csv). */
export function detectFormat(fileName: string): SiafiFileFormat {
	return /\.xlsx?$/i.test(fileName) ? "xlsx" : "csv"
}

/** Índice da linha de cabeçalho: primeira com ≥2 células textuais não vazias. */
export function findHeaderRow(rows: readonly unknown[][]): number {
	for (let i = 0; i < Math.min(rows.length, 30); i++) {
		const cells = (rows[i] ?? []).filter((cell) => cell != null && String(cell).trim() !== "")
		if (cells.length < 2) continue
		const textual = cells.filter((cell) => typeof cell === "string" && !/^-?[\d.,]+$/.test(String(cell).trim()))
		if (textual.length >= 2) return i
	}
	return 0
}

/** Matriz (linhas × células) → objetos usando a linha de cabeçalho detectada. */
export function rowsToObjects(matrix: readonly unknown[][]): Record<string, unknown>[] {
	if (matrix.length === 0) return []
	const headerIndex = findHeaderRow(matrix)
	const headers = (matrix[headerIndex] ?? []).map((cell, index) => {
		const text = cell == null ? "" : String(cell).trim()
		return text === "" ? `coluna_${index + 1}` : text
	})

	const out: Record<string, unknown>[] = []
	for (let i = headerIndex + 1; i < matrix.length; i++) {
		const row = matrix[i] ?? []
		if (row.every((cell) => cell == null || String(cell).trim() === "")) continue
		const obj: Record<string, unknown> = {}
		headers.forEach((header, index) => {
			obj[header] = row[index] ?? null
		})
		out.push(obj)
	}
	return out
}

/** CSV com separador auto-detectado (`;` do padrão pt-BR, `,` ou tab). */
export function parseCsv(text: string): Record<string, unknown>[] {
	const clean = text.replace(/^﻿/, "")
	const lines = clean.split(/\r?\n/)
	const sample = lines.slice(0, 20).join("\n")
	const separator = [";", "\t", ","].reduce((best, candidate) => {
		const count = sample.split(candidate).length
		return count > sample.split(best).length ? candidate : best
	}, ";")

	// Conferido antes de dividir as células: um CSV de 15 MB só de quebras de linha eram
	// milhões de linhas alocadas para nada.
	if (lines.length > MAX_SIAFI_ROWS + 1) throw new SiafiParseError(TOO_MANY_ROWS)
	const matrix = lines.map((line) => {
		const cells = splitCsvLine(line, separator)
		if (cells.length > MAX_SIAFI_COLUMNS) throw new SiafiParseError(TOO_MANY_COLUMNS)
		return cells
	})
	return rowsToObjects(matrix)
}

/** Split respeitando aspas duplas (com escape `""`). */
function splitCsvLine(line: string, separator: string): string[] {
	const cells: string[] = []
	let current = ""
	let inQuotes = false
	for (let i = 0; i < line.length; i++) {
		const char = line[i]
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"'
				i++
			} else {
				inQuotes = !inQuotes
			}
			continue
		}
		if (char === separator && !inQuotes) {
			cells.push(current.trim())
			current = ""
			continue
		}
		current += char
	}
	cells.push(current.trim())
	return cells
}

/** Assinatura de entrada local de zip (`PK\x03\x04`) — o `.xlsx` é um zip. */
function isZip(bytes: Uint8Array): boolean {
	return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

/**
 * Descompacta o `.xlsx` sob teto e o reempacota SEM compressão para o SheetJS.
 *
 * O SheetJS descompacta TODAS as entradas do zip, e cresce o buffer até o fim do fluxo
 * deflate — o tamanho declarado não o limita. O fflate, por outro lado, aloca pelo
 * tamanho DECLARADO no diretório central e nunca realoca (o que passar disso é
 * descartado), e o filtro recusa a declaração acima do teto ANTES de alocar. O que o
 * SheetJS recebe depois é um zip `store` cujo conteúdo já cabe nos tetos.
 */
function boundXlsxArchive(bytes: Uint8Array): Uint8Array {
	// `.xls` antigo é CFB, não zip: não tem compressão, então o tamanho já é o do corpo.
	if (!isZip(bytes)) return bytes
	let entries = 0
	let declaredBytes = 0
	let files: Record<string, Uint8Array>
	try {
		files = unzipSync(bytes, {
			filter: (file) => {
				entries += 1
				if (entries > MAX_XLSX_ENTRIES) throw new SiafiParseError("Arquivo XLSX inválido: entradas demais no pacote.")
				const declared = Math.max(file.size, file.originalSize)
				declaredBytes += declared
				if (declared > MAX_XLSX_ENTRY_BYTES || declaredBytes > MAX_XLSX_UNCOMPRESSED_BYTES) {
					throw new SiafiParseError("Arquivo XLSX grande demais depois de descompactado — divida o relatório e importe as partes.")
				}
				return true
			},
		})
	} catch (err) {
		if (err instanceof SiafiParseError) throw err
		throw new SiafiParseError("Arquivo XLSX inválido ou corrompido.")
	}
	return zipSync(files, { level: 0 })
}

function readBoundedWorkbook(archive: Uint8Array): XLSX.WorkBook {
	return XLSX.read(archive, {
		type: "array",
		cellDates: false,
		raw: false,
		// Só a primeira planilha é lida — as outras nem são parseadas.
		sheets: 0,
		// O `<dimension>` é declarado pelo arquivo e é mentira barata: a extensão sai das
		// células que existem. E a leitura para uma linha depois do teto — o que basta para
		// saber que ele foi excedido, sem alocar o resto.
		nodim: true,
		sheetRows: MAX_SIAFI_ROWS + 1,
		dense: true,
	})
}

/** XLSX (primeira planilha) → objetos. */
export function parseXlsx(bytes: Uint8Array): Record<string, unknown>[] {
	const archive = boundXlsxArchive(bytes)
	let workbook: XLSX.WorkBook
	try {
		workbook = readBoundedWorkbook(archive)
	} catch {
		throw new SiafiParseError("Arquivo XLSX inválido ou corrompido.")
	}
	const sheetName = workbook.SheetNames[0]
	if (!sheetName) return []
	const sheet = workbook.Sheets[sheetName]
	if (!sheet?.["!ref"]) return []

	// A matriz que o `sheet_to_json` monta é linhas × colunas do intervalo, com `defval`
	// em cada buraco — o tamanho dela é conferido ANTES de montá-la.
	const range = XLSX.utils.decode_range(sheet["!ref"])
	if (range.e.r >= MAX_SIAFI_ROWS) throw new SiafiParseError(TOO_MANY_ROWS)
	if (range.e.c >= MAX_SIAFI_COLUMNS) throw new SiafiParseError(TOO_MANY_COLUMNS)

	const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false }) as unknown[][]
	return rowsToObjects(matrix)
}

/** Ponto de entrada: bytes + nome → objetos cabeçalho→valor. */
export function readSiafiFile(bytes: Uint8Array, fileName: string): Record<string, unknown>[] {
	if (detectFormat(fileName) === "xlsx") return parseXlsx(bytes)
	return parseCsv(new TextDecoder("utf-8").decode(bytes))
}
