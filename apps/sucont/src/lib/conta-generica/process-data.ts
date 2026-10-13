// Extraído de routes/conta-generica.tsx (port do analistacontagenerica): leitura da
// planilha do Tesouro Gerencial e agrupamento dos saldos por UG e conta.
import * as XLSX from "xlsx"
import type { GroupedData } from "#/lib/conta-generica/helpers"

export type ProcessDataResult = { error: string } | { grouped: GroupedData; hasGeneric: boolean }

interface ColumnIndices {
	ug: number
	conta: number
	mes: number
	saldo: number
}

interface DataRow {
	ug: string
	conta: string
	mes: string
	saldo: number
}

const HEADER_NOT_FOUND_ERROR =
	"Não foi possível encontrar o cabeçalho da tabela com as colunas: UG, Conta Contábil, Mês, Saldo - R$. Verifique o formato do arquivo."

// Rótulos aceitos por coluna, já normalizados (trim + minúsculas).
const CONTA_HEADERS = ["conta contábil", "conta contabil"]
const MES_HEADERS = ["mês", "mes", "conta corrente"]
const SALDO_HEADERS = ["saldo - r$", "saldo - r $", "saldo", "valor alongado"]

/** Linhas da primeira aba do workbook (o que o `FileReader` entrega). Lança se o arquivo não for Excel. */
export function readWorkbookRows(buffer: unknown): unknown[][] {
	const wb = XLSX.read(buffer, { type: "array" })
	const ws = wb.Sheets[wb.SheetNames[0]]
	return XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]
}

function normalizeHeaderRow(row: unknown[]): string[] {
	return row.map((c) =>
		String(c || "")
			.trim()
			.toLowerCase()
	)
}

/** Índices das quatro colunas, se a linha for o cabeçalho completo. */
function matchHeaderRow(row: unknown[]): ColumnIndices | null {
	const norm = normalizeHeaderRow(row)
	const ugIdx = norm.indexOf("ug")
	const contaIdx = norm.findIndex((c) => CONTA_HEADERS.includes(c))
	const mesIdx = norm.findIndex((c) => MES_HEADERS.includes(c))
	const saldoIdx = norm.findIndex((c) => SALDO_HEADERS.includes(c))
	if (ugIdx !== -1 && contaIdx !== -1 && mesIdx !== -1 && saldoIdx !== -1) {
		return { ug: ugIdx, conta: contaIdx, mes: mesIdx, saldo: saldoIdx }
	}
	return null
}

/** Primeira linha que é cabeçalho completo. */
function findHeaderRow(data: unknown[][]): { headerRowIndex: number; colIndices: ColumnIndices } | null {
	for (let i = 0; i < data.length; i++) {
		const row = data[i]
		if (!Array.isArray(row)) continue
		const colIndices = matchHeaderRow(row)
		if (colIndices) return { headerRowIndex: i, colIndices }
	}
	return null
}

/** Número vem como está; texto no formato brasileiro ("1.234,56"). */
function parseSaldo(rawSaldo: unknown): number {
	if (typeof rawSaldo === "number") return rawSaldo
	return parseFloat(String(rawSaldo).replace(/\./g, "").replace(",", "."))
}

/** Linha de dado utilizável, ou `null` quando falta célula ou o saldo é zero/ilegível. */
function parseDataRow(row: unknown, colIndices: ColumnIndices): DataRow | null {
	if (!Array.isArray(row) || row.length === 0) return null
	const rawUg = row[colIndices.ug]
	const rawConta = row[colIndices.conta]
	const rawMes = row[colIndices.mes]
	const rawSaldo = row[colIndices.saldo]
	if (rawUg == null || rawConta == null || rawMes == null || rawSaldo == null) return null
	if (rawUg === "" || rawConta === "") return null

	const ug = String(rawUg).trim()
	const conta = String(rawConta).replace(/\s+/g, "").replace(/\./g, "")
	const mes = String(rawMes).trim()
	const saldo = parseSaldo(rawSaldo)

	if (Number.isNaN(saldo) || saldo === 0) return null
	return { ug, conta, mes, saldo }
}

export const processData = (data: unknown[][]): ProcessDataResult => {
	const header = findHeaderRow(data)

	if (!header) {
		return { error: HEADER_NOT_FOUND_ERROR }
	}

	const grouped: GroupedData = {}
	let hasGeneric = false

	for (let i = header.headerRowIndex + 1; i < data.length; i++) {
		const parsed = parseDataRow(data[i], header.colIndices)
		if (!parsed) continue
		const { ug, conta, mes, saldo } = parsed
		if (conta.length > 0) {
			hasGeneric = true
			if (!grouped[ug]) grouped[ug] = {}
			if (!grouped[ug][conta]) grouped[ug][conta] = []
			grouped[ug][conta].push({ mes, saldo })
		}
	}

	return { grouped, hasGeneric }
}
