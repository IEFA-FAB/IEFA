// Extraído de routes/conta-generica.tsx (port do analistacontagenerica): leitura da
// planilha do Tesouro Gerencial e agrupamento dos saldos por UG e conta.
import * as XLSX from "xlsx"
import type { GroupedData } from "#/lib/conta-generica/helpers"

export type ProcessDataResult =
	| { error: string }
	| {
			grouped: GroupedData
			hasGeneric: boolean
			/** Linhas com saldo cuja conta não é genérica: lidas e deixadas de fora, contadas para a tela avisar. */
			skippedNonGeneric: number
	  }

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

/**
 * Conta contábil genérica: a do saldo residual "Outros…", que a tela descreve como
 * "terminada em 99".
 *
 * No código de 9 dígitos do PCASP (classe, grupo, subgrupo, título e subtítulo com um
 * dígito cada, item e subitem com dois), o residual aparece em dois lugares:
 * - no subitem: `218810199` (subitem 99 do item 01);
 * - no item, quando ele não se desdobra em subitem: `XXXXX9900`. Aqui o código termina em
 *   `00`, mas o último nível preenchido é o 99.
 *
 * Item 99 COM subitem próprio não é genérico: `123119905` é "Bens móveis em trânsito"
 * (Questão 9 do RAC), uma conta específica que só mora sob o item 99.
 *
 * Código fora do formato de 9 dígitos (o relatório nunca o traz, mas a planilha pode vir
 * editada) cai na regra literal: termina em 99.
 */
export function isGenericAccount(conta: string): boolean {
	if (/^\d{9}$/.test(conta)) {
		const item = conta.slice(5, 7)
		const subitem = conta.slice(7, 9)
		return subitem === "99" || (subitem === "00" && item === "99")
	}
	return conta.endsWith("99")
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
	let skippedNonGeneric = 0

	for (let i = header.headerRowIndex + 1; i < data.length; i++) {
		const parsed = parseDataRow(data[i], header.colIndices)
		if (!parsed) continue
		const { ug, conta, mes, saldo } = parsed
		if (conta.length === 0) continue
		// O port aceitava qualquer conta com saldo, embora a tela prometa identificar as de
		// final 99: o recorte dependia de o relatório do Tesouro Gerencial vir já filtrado.
		if (!isGenericAccount(conta)) {
			skippedNonGeneric++
			continue
		}
		hasGeneric = true
		if (!grouped[ug]) grouped[ug] = {}
		if (!grouped[ug][conta]) grouped[ug][conta] = []
		grouped[ug][conta].push({ mes, saldo })
	}

	return { grouped, hasGeneric, skippedNonGeneric }
}
