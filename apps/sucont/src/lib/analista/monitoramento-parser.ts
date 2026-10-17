// Extraído de routes/monitoramento.tsx (port do Analistasaldoimproprio e do centromonitoramento).
import * as XLSX from "xlsx"
import { classifyAccount, type ProcessedRow } from "#/lib/analista/types"
import { parseBrazilianAmount } from "#/lib/analysis/saldo"
import { isUgAcompanhada } from "#/lib/ug/registry"

export interface ParsedWorkbook {
	processed: ProcessedRow[]
	/** `false` quando o cabeçalho UG/Mês/Conta/Saldo não foi achado: falha de leitura. */
	isHeaderFound: boolean
}

interface ColumnIndices {
	ug: number
	mes: number
	conta: number
	saldo: number
}

type ColumnKey = keyof ColumnIndices

const normalizeString = (str: unknown) => {
	if (typeof str !== "string") return ""
	return str
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.trim()
}

/** Qual coluna do cabeçalho o texto (já normalizado) nomeia; a ordem dos testes é a prioridade. */
function classifyHeaderCell(norm: string): ColumnKey | null {
	if (["ug", "unidade gestora", "cod ug", "codigo ug"].some((k) => norm.includes(k))) {
		return "ug"
	} else if (["mes", "referencia", "periodo"].some((k) => norm.includes(k))) {
		return "mes"
	} else if (["conta", "conta contabil", "cod conta"].some((k) => norm.includes(k)) && !norm.includes("bancaria")) {
		return "conta"
	} else if (["saldo", "valor"].some((k) => norm.includes(k))) {
		return "saldo"
	}
	return null
}

/** Índices das quatro colunas numa linha candidata a cabeçalho; a última célula que casa vence. */
function detectHeaderColumns(row: unknown[]): ColumnIndices {
	const tempIndices = { ug: -1, mes: -1, conta: -1, saldo: -1 }

	row.forEach((cell, index) => {
		const norm = normalizeString(cell)
		if (!norm) return

		const key = classifyHeaderCell(norm)
		if (key) tempIndices[key] = index
	})

	return tempIndices
}

function isCompleteHeader(indices: ColumnIndices): boolean {
	return indices.ug !== -1 && indices.mes !== -1 && indices.conta !== -1 && indices.saldo !== -1
}

/** Primeira linha que nomeia as quatro colunas. `dataStartIndex` -1 = cabeçalho não encontrado. */
function findHeader(rows: unknown[][]): { colIndices: ColumnIndices; dataStartIndex: number } {
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]
		if (!Array.isArray(row)) continue

		const tempIndices = detectHeaderColumns(row)

		if (isCompleteHeader(tempIndices)) {
			return { colIndices: tempIndices, dataStartIndex: i + 1 }
		}
	}
	return { colIndices: { ug: -1, mes: -1, conta: -1, saldo: -1 }, dataStartIndex: -1 }
}

function isFilledCell(value: unknown): boolean {
	return value != null && String(value).trim() !== ""
}

function buildProcessedRow(ug: string, mes: string, conta: string, saldo: number): ProcessedRow {
	const { classification, description, observation, accountCode, questaoRAC } = classifyAccount(ug, conta, saldo)
	return {
		ug,
		mes,
		conta: accountCode,
		descricao: description,
		saldo,
		classificacao: classification,
		observacao: observation,
		questaoRAC,
	}
}

/** Lê as linhas abaixo do cabeçalho pelas colunas que ele nomeou. */
function parseRowsWithHeader(rows: unknown[][], colIndices: ColumnIndices, dataStartIndex: number): ProcessedRow[] {
	const processed: ProcessedRow[] = []
	for (let i = dataStartIndex; i < rows.length; i++) {
		const row = rows[i]
		if (!Array.isArray(row)) continue

		const ugRaw = row[colIndices.ug]
		const mesRaw = row[colIndices.mes]
		const contaRaw = row[colIndices.conta]
		const saldoRaw = row[colIndices.saldo]

		if (![ugRaw, mesRaw, contaRaw, saldoRaw].every(isFilledCell)) continue

		const ug = String(ugRaw).trim()
		const mes = String(mesRaw).trim()
		const conta = String(contaRaw).trim()
		const saldo = parseBrazilianAmount(saldoRaw)

		if (!Number.isNaN(saldo) && saldo !== 0 && isUgAcompanhada(ug)) {
			processed.push(buildProcessedRow(ug, mes, conta, saldo))
		}
	}
	return processed
}

const MONTH_NAMES = "janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro"
const MONTH_ABBREVIATIONS = "jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez"
/** As abreviações inglesas que diferem das portuguesas (JAN, MAR, JUN, JUL e NOV coincidem). */
const ENGLISH_MONTH_ABBREVIATIONS = "feb|apr|may|aug|sep|oct|dec"

/** Mês por extenso ou abreviado, com ano opcional ("JAN", "jan/2026", "Março/26", "JAN2026", "OCT/2026"). */
const NAMED_MONTH = new RegExp(`^(${MONTH_NAMES}|${MONTH_ABBREVIATIONS}|${ENGLISH_MONTH_ABBREVIATIONS})(\\/?(\\d{2}|\\d{4}))?$`)

/** "01/2026": mês de 01 a 12. */
const NUMERIC_MONTH = /^(0[1-9]|1[0-2])\/\d{4}$/

/**
 * Célula com cara de competência, no fallback sem cabeçalho. O port aceitava qualquer
 * palavra de três letras ou mais ("TEXTO", "TOTAL", "BASP"): a primeira palavra da linha
 * virava a competência, e o mês de verdade, se viesse depois, era descartado.
 */
function isMonthLike(str: string): boolean {
	const normalized = str
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
	return NAMED_MONTH.test(normalized) || NUMERIC_MONTH.test(str)
}

interface HeuristicRow {
	ug: string
	mes: string
	conta: string
	saldo: number
	foundUg: boolean
	foundMes: boolean
	foundConta: boolean
	foundSaldo: boolean
}

/** Encaixa uma célula no primeiro campo ainda vazio que o formato dela aceita. */
function assignHeuristicCell(state: HeuristicRow, cell: unknown): void {
	if (cell == null || String(cell).trim() === "") return
	const str = String(cell).trim()

	if (!state.foundUg && /^\d{6}$/.test(str)) {
		state.ug = str
		state.foundUg = true
	} else if (!state.foundConta && /^\d{9}$/.test(str)) {
		state.conta = str
		state.foundConta = true
	} else if (!state.foundMes && isMonthLike(str)) {
		state.mes = str
		state.foundMes = true
	} else if (!state.foundSaldo) {
		const parsed = parseBrazilianAmount(cell)
		if (!Number.isNaN(parsed)) {
			state.saldo = parsed
			state.foundSaldo = true
		}
	}
}

function parseRowHeuristically(row: unknown[]): ProcessedRow | null {
	const state: HeuristicRow = {
		ug: "",
		mes: "",
		conta: "",
		saldo: 0,
		foundUg: false,
		foundMes: false,
		foundConta: false,
		foundSaldo: false,
	}

	row.forEach((cell) => {
		assignHeuristicCell(state, cell)
	})

	const { ug, mes, conta, saldo } = state
	if (state.foundUg && state.foundMes && state.foundConta && state.foundSaldo && saldo !== 0 && isUgAcompanhada(ug)) {
		return buildProcessedRow(ug, mes, conta, saldo)
	}
	return null
}

/** Varre todas as linhas, cabeçalho incluso, reconhecendo cada campo pelo formato. */
function parseRowsHeuristically(rows: unknown[][]): ProcessedRow[] {
	const processed: ProcessedRow[] = []
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]
		if (!Array.isArray(row)) continue

		const parsed = parseRowHeuristically(row)
		if (parsed) processed.push(parsed)
	}
	return processed
}

export function parseWorkbook(rawData: string | ArrayBuffer | null | undefined): ParsedWorkbook {
	const workbook = XLSX.read(rawData, { type: "array" })
	const firstSheetName = workbook.SheetNames[0]
	const worksheet = workbook.Sheets[firstSheetName]
	const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
		header: 1,
		defval: null,
	})

	const { colIndices, dataStartIndex } = findHeader(rows)

	let processed: ProcessedRow[] = dataStartIndex !== -1 ? parseRowsWithHeader(rows, colIndices, dataStartIndex) : []

	// Fallback heurístico
	if (processed.length === 0) {
		processed = parseRowsHeuristically(rows)
	}

	// Cabeçalho não encontrado é FALHA de leitura, não competência limpa: antes
	// caía em `setData([])` com o nome do arquivo já gravado, e a tela trocava
	// para o painel mostrando zero ocorrência (§7.1). Nenhuma linha aproveitada
	// COM o cabeçalho lido é vazio de verdade, e segue para o painel.
	return { processed, isHeaderFound: dataStartIndex !== -1 }
}
