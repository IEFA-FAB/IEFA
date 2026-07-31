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

import * as XLSX from "xlsx"

export type SiafiFileFormat = "csv" | "xlsx"

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

	const matrix = lines.map((line) => splitCsvLine(line, separator))
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

/** XLSX (primeira planilha) → objetos. */
export function parseXlsx(bytes: Uint8Array): Record<string, unknown>[] {
	const workbook = XLSX.read(bytes, { type: "array", cellDates: false, raw: false })
	const sheetName = workbook.SheetNames[0]
	if (!sheetName) return []
	const sheet = workbook.Sheets[sheetName]
	if (!sheet) return []
	const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false }) as unknown[][]
	return rowsToObjects(matrix)
}

/** Ponto de entrada: bytes + nome → objetos cabeçalho→valor. */
export function readSiafiFile(bytes: Uint8Array, fileName: string): Record<string, unknown>[] {
	if (detectFormat(fileName) === "xlsx") return parseXlsx(bytes)
	return parseCsv(new TextDecoder("utf-8").decode(bytes))
}
