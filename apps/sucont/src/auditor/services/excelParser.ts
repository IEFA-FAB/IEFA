import { read, utils } from "xlsx"
import type { RawInputRow } from "../types"

// biome-ignore lint/suspicious/noExplicitAny: xlsx types
type SheetRow = any[]

/** Onde começam as linhas de dado e quanto as colunas estão deslocadas. */
interface DataStart {
	startRowIndex: number
	offset: number
}

/**
 * Mês colado ao ano ("JAN2024", "DEZ2025", "MARÇO2024"). O port só aceitava JAN/FEV/MAR/ABR/
 * SET, e por `includes` em qualquer lugar do texto: "MAI2024" ou "DEZ2024" não contavam.
 * Exigir o ano logo depois do mês vale para os doze sem pegar palavra que só contém as
 * letras ("OUTROS 2024" já conta pelo espaço).
 */
const COLLATED_MONTH_YEAR = /(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[A-ZÇ]*20\d{2}/

/**
 * Texto que é só um valor: sinal, "R$" e dígitos com ponto e vírgula ("-100", "R$ -50,5",
 * "-R$ 1.234,56"). O traço de sinal não é separador de data.
 */
const AMOUNT_TEXT = /^[-+]?\s*(R\$)?\s*[-+]?\d[\d.,]*$/

/** Célula com cara de competência, na varredura da competência inicial. */
const isDateLikeCell = (str: string): boolean => {
	if (AMOUNT_TEXT.test(str)) return false
	const hasDigit = /\d/.test(str)
	if (hasDigit && (str.includes("/") || str.includes("-") || str.includes(" "))) return true
	return COLLATED_MONTH_YEAR.test(str)
}

/** Primeira célula com cara de data nas 100 primeiras linhas; "" se não houver. */
const findInitialDate = (jsonData: SheetRow[]): string => {
	for (let i = 0; i < Math.min(jsonData.length, 100); i++) {
		const row = jsonData[i]
		if (!row || !Array.isArray(row)) continue
		for (const cell of row) {
			// Número não é competência: um saldo negativo (-100) passava pelo teste do traço.
			if (!cell || typeof cell === "number") continue
			const str = String(cell).trim().toUpperCase()
			if (isDateLikeCell(str)) return String(cell)
		}
	}
	return ""
}

/**
 * Regras de detecção do início dos dados pela coluna 0, na ordem em que são
 * testadas em cada linha. `skipRow` = a linha é cabeçalho e o dado começa na
 * seguinte; `offset` -1 = não há coluna de data e tudo anda uma posição.
 */
const DATA_START_RULES: { matches: (col0: string) => boolean; skipRow: boolean; offset: number }[] = [
	{
		matches: (col0) => col0 === "DATA" || col0.includes("MÊS") || col0.includes("REF") || col0.includes("PERÍODO"),
		skipRow: true,
		offset: 0,
	},
	{ matches: (col0) => col0 === "COD" || col0 === "CÓD" || col0 === "UG", skipRow: true, offset: -1 },
	{
		matches: (col0) => (col0.includes("/") && /\d/.test(col0)) || (col0.length === 6 && !Number.isNaN(Number(col0))),
		skipRow: false,
		offset: 0,
	},
]

/** Procura o cabeçalho (ou a primeira linha de dado) nas 30 primeiras linhas. */
const detectDataStart = (jsonData: SheetRow[]): DataStart => {
	for (let i = 0; i < Math.min(jsonData.length, 30); i++) {
		const row = jsonData[i]
		if (!row || row.length < 2) continue

		const col0 = String(row[0] || "")
			.toUpperCase()
			.trim()

		const rule = DATA_START_RULES.find((r) => r.matches(col0))
		if (rule) return { startRowIndex: rule.skipRow ? i + 1 : i, offset: rule.offset }
	}

	return { startRowIndex: 1, offset: 0 }
}

// biome-ignore lint/suspicious/noExplicitAny: xlsx types
const getCol = (row: SheetRow, offset: number, baseIndex: number): any => {
	const idx = baseIndex + offset
	return idx >= 0 ? row[idx] : undefined
}

// biome-ignore lint/suspicious/noExplicitAny: xlsx types
const safeNum = (val: any): number => {
	if (typeof val === "number") return Number.isNaN(val) ? 0 : val
	if (!val) return 0
	if (typeof val === "string") {
		const clean = val.replace(/[^\d,-]/g, "").replace(",", ".")
		const num = Number.parseFloat(clean)
		return Number.isNaN(num) ? 0 : num
	}
	return 0
}

// biome-ignore lint/suspicious/noExplicitAny: xlsx types
const safeStr = (val: any) => {
	if (val instanceof Date) return val.toISOString()
	return val !== undefined && val !== null ? String(val).trim() : ""
}

/**
 * Competência da linha: a da coluna de data, se parecer data; senão a última conhecida.
 *
 * Com `offset` -1 (cabeçalho "COD"/"UG" na coluna 0) não há coluna de data: a coluna 0 é
 * o COD. O port lia mesmo assim, e o COD de 6 caracteres passava no teste de "mais de 5
 * caracteres" e virava a competência de cada linha. Aqui a competência fica a da
 * varredura inicial.
 */
const resolveRowDate = (row: SheetRow, offset: number, lastKnownDate: string): string => {
	if (offset < 0) return lastKnownDate
	const dateCandidate = safeStr(row[0])
	if (dateCandidate && dateCandidate.length >= 3) {
		if (dateCandidate.includes("/") || dateCandidate.includes("-") || dateCandidate.includes(" ") || dateCandidate.length > 5) {
			return dateCandidate
		}
	}
	return lastKnownDate
}

/** Linha larga do relatório → `RawInputRow`; `null` quando não há COD nem UG. */
const buildRawRow = (row: SheetRow, offset: number, date: string): RawInputRow | null => {
	const codVal = safeStr(getCol(row, offset, 1))
	const ugVal = safeStr(getCol(row, offset, 2))

	if (!codVal && !ugVal) return null

	return {
		data: date || "DATA_DESCONHECIDA",
		cod: codVal || "000000",
		ug: ugVal || "UG_DESCONHECIDA",

		g1_name: "CONSUMO",
		g1_siafi: safeNum(getCol(row, offset, 4)),
		g1_siloms: safeNum(getCol(row, offset, 5)),
		g1_diff: safeNum(getCol(row, offset, 6)),

		g2_name: "BMP",
		g2_siafi: safeNum(getCol(row, offset, 8)),
		g2_siloms: safeNum(getCol(row, offset, 9)),
		g2_diff: safeNum(getCol(row, offset, 10)),

		g3_name: "INTANGIVEL",
		g3_siafi: safeNum(getCol(row, offset, 12)),
		g3_siloms: safeNum(getCol(row, offset, 13)),
		g3_diff: safeNum(getCol(row, offset, 14)),
	}
}

/** Linhas da primeira aba (`sheet_to_json` com `header: 1`) → linhas do relatório. */
export const parseSheetRows = (jsonData: SheetRow[]): RawInputRow[] => {
	const parsedRows: RawInputRow[] = []
	const initialDate = findInitialDate(jsonData)
	const { startRowIndex, offset } = detectDataStart(jsonData)

	let lastKnownDate = initialDate

	for (let i = startRowIndex; i < jsonData.length; i++) {
		const row = jsonData[i]
		if (!row || !Array.isArray(row)) continue

		// A competência anda mesmo em linha que será pulada por falta de COD e UG.
		lastKnownDate = resolveRowDate(row, offset, lastKnownDate)

		const parsed = buildRawRow(row, offset, lastKnownDate)
		if (parsed) parsedRows.push(parsed)
	}

	return parsedRows
}

/** Conteúdo lido do arquivo (ArrayBuffer do FileReader) → linhas do relatório. */
export const parseWorkbook = (data: string | ArrayBuffer | null | undefined): RawInputRow[] => {
	if (!data) throw new Error("File content is empty")

	const workbook = read(data, { type: "array", cellDates: true })

	const firstSheetName = workbook.SheetNames[0]
	if (!firstSheetName) throw new Error("No sheets found in workbook")

	const worksheet = workbook.Sheets[firstSheetName]

	// biome-ignore lint/suspicious/noExplicitAny: xlsx types
	const jsonData = utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: null })

	return parseSheetRows(jsonData)
}

export const parseExcelFile = async (file: File): Promise<RawInputRow[]> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()

		reader.onload = (e) => {
			try {
				resolve(parseWorkbook(e.target?.result))
			} catch (error) {
				reject(error)
			}
		}

		reader.onerror = (error) => reject(error)
		reader.readAsArrayBuffer(file)
	})
}
