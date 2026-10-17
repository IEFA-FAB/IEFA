/**
 * @module lib/compatibilidade/parser
 * Extraído de routes/analista-compatibilidade.tsx (port do analistacompatibilidade):
 * linhas da planilha do Tesouro Gerencial → relatório de divergências por UG.
 */

import * as XLSX from "xlsx"
import { parseBrazilianAmountOrZero } from "#/lib/analysis/saldo"
import { agregarSaldos, compararPares, type LinhaSaldo, PARES, type ParDivergente } from "#/lib/compatibilidade/pares"
import { getUg } from "#/lib/ug/registry"
import { formatCurrency, normalizeKey } from "./format"

export const PAIRS = PARES

// Paleta CATEGÓRICA de visualização: existe para distinguir categorias entre si.
// Fica em hex explícito de propósito (ver STYLE_CONTRACT §8) — mapeá-la para
// tokens de estado colapsa cores diferentes na mesma e a legenda passa a afirmar
// que duas categorias são a mesma coisa.
export const PAIR_COLORS = ["#ef4444", "#f97316", "#eab308"]

type PairBase = (typeof PAIRS)[number]

export interface DivergentPair extends PairBase {
	saldoA: number | undefined
	saldoB: number | undefined
	diff: number
	hasA: boolean
	hasB: boolean
}

export interface UGReport {
	ug: string
	ugCode: string
	ugName: string
	superior: string
	ods: string
	conferente: string
	totalDiff: number
	divergencias: string[]
	chartData: { name: string; description: string; value: number; color: string; question: string }[]
	pairs: DivergentPair[]
}

export type SheetRow = (string | number | boolean | null | undefined)[]

/**
 * Linhas da primeira aba do arquivo (xlsx, xls ou CSV). Célula numérica chega como número
 * (`sheet_to_json` cru) e texto como foi digitado. O `raw: true` do `XLSX.read` vale só
 * para CSV: sem ele, o SheetJS adivinha número em inglês e "1.234,56" vira 1,23456.
 */
export function readSheetRows(data: ArrayBuffer | Uint8Array): SheetRow[] {
	const workbook = XLSX.read(data, { type: "array", raw: true })
	const worksheet = workbook.Sheets[workbook.SheetNames[0]]
	return XLSX.utils.sheet_to_json<SheetRow>(worksheet, { header: 1 })
}

interface HeaderColumns {
	headerRowIndex: number
	ugCol: number
	contaCol: number
	saldoCol: number
}

/** Colunas de UG, conta e saldo numa linha candidata a cabeçalho (-1 = não achou). */
function detectHeaderColumns(row: SheetRow) {
	let tempUg = -1
	let tempConta = -1
	let tempSaldo = -1

	for (let j = 0; j < row.length; j++) {
		const cellValue = String(row[j] || "")
		const normalized = normalizeKey(cellValue)

		if (normalized === "ug" || normalized === "unidade gestora") tempUg = j
		else if (normalized.includes("conta")) tempConta = j
		else if (normalized.includes("saldo")) tempSaldo = j
	}

	return { tempUg, tempConta, tempSaldo }
}

/** Primeira linha, entre as 50 iniciais, que tem as três colunas; `null` se nenhuma tiver. */
function findHeaderColumns(data: SheetRow[]): HeaderColumns | null {
	for (let i = 0; i < Math.min(data.length, 50); i++) {
		const row = data[i]
		if (!Array.isArray(row)) continue

		const { tempUg, tempConta, tempSaldo } = detectHeaderColumns(row)

		if (tempUg !== -1 && tempConta !== -1 && tempSaldo !== -1) {
			return { headerRowIndex: i, ugCol: tempUg, contaCol: tempConta, saldoCol: tempSaldo }
		}
	}
	return null
}

function isBlankCell(value: SheetRow[number]) {
	return value === undefined || value === null || value === ""
}

/**
 * Saldo da célula pela regra compartilhada (`parseBrazilianAmount`). O que não é número
 * conta 0, como antes: a linha entra no par e a divergência é que aponta o problema. A
 * cópia antiga tirava todo ponto ("1500.25" virava 150025) e não lia parênteses.
 */
export function parseSaldo(saldoRaw: SheetRow[number]): number {
	return parseBrazilianAmountOrZero(saldoRaw)
}

/** Linhas de dados abaixo do cabeçalho; pula as que não têm UG ou conta. */
function readLinhas(data: SheetRow[], { headerRowIndex, ugCol, contaCol, saldoCol }: HeaderColumns): LinhaSaldo[] {
	const linhas: LinhaSaldo[] = []

	for (let i = headerRowIndex + 1; i < data.length; i++) {
		const row = data[i]
		if (!Array.isArray(row)) continue

		const ugRaw = row[ugCol]
		const contaRaw = row[contaCol]
		const saldoRaw = row[saldoCol]

		if (isBlankCell(ugRaw) || isBlankCell(contaRaw)) continue

		const ug = String(ugRaw).trim()
		const conta = String(contaRaw).replace(/\D/g, "")
		const saldo = parseSaldo(saldoRaw)

		linhas.push({ ug, conta, saldo })
	}

	return linhas
}

function formatDivergencia({ par, indice, saldoA, saldoB, diff, hasA, hasB }: ParDivergente) {
	const displayA = hasA && saldoA !== undefined ? formatCurrency(saldoA) : "CONTA NÃO LOCALIZADA NO RELATÓRIO"
	const displayB = hasB && saldoB !== undefined ? formatCurrency(saldoB) : "CONTA NÃO LOCALIZADA NO RELATÓRIO"

	return `
${indice + 1}) Conta ${par.a} - ${par.nameA} × Conta ${par.b} - ${par.nameB}

Saldo da conta ${par.a}: ${displayA}
Saldo da conta ${par.b}: ${displayB}

Diferença apurada: ${formatCurrency(diff)}
`.trim()
}

/** Código, nome e vinculação da UG: do cadastro quando houver, senão do próprio texto da planilha. */
function resolveUgIdentity(ug: string) {
	const ugMatch = ug.match(/\d{6}/)
	const ugCode = ugMatch ? ugMatch[0] : ug
	const metadata = getUg(ugCode)
	const ugName = metadata ? metadata.sigla : ug.includes(" - ") ? ug.split(" - ")[1] : ug
	const superior = metadata?.orgaoSuperior ?? "Não Identificado"
	const ods = metadata?.ods ?? "Não Identificado"
	const conferente = metadata?.conferente ?? "Não Identificado"

	return { ugCode, ugName, superior, ods, conferente }
}

/** Relatório de uma UG, ou `null` quando nenhum par diverge. */
function buildUgReport(ug: string, contas: Record<string, number>): UGReport | null {
	const { divergentes, totalDiff } = compararPares(contas)

	const chartData = divergentes.map(({ par, indice, absDiff }) => ({
		name: `Par ${indice + 1}`,
		description: `${par.a} (${par.nameA}) × ${par.b} (${par.nameB})`,
		value: absDiff,
		color: PAIR_COLORS[indice],
		question: par.question,
	}))

	const divergentPairs: DivergentPair[] = divergentes.map(({ par, saldoA, saldoB, diff, hasA, hasB }) => ({
		...par,
		saldoA,
		saldoB,
		diff,
		hasA,
		hasB,
	}))

	const divergencias = divergentes.map(formatDivergencia)

	// A lista de divergentes manda, não o somatório: par com um lado só e saldo
	// zerado do outro é divergência (falta o registro espelhado) com `absDiff`
	// zero. Comparando `totalDiff > 0`, essa UG sumia do relatório — e, se fosse
	// a única, a tela dizia "nenhuma divergência encontrada".
	if (divergentes.length === 0) return null

	return {
		ug,
		...resolveUgIdentity(ug),
		totalDiff,
		divergencias,
		chartData,
		pairs: divergentPairs,
	}
}

/**
 * Lê as linhas da planilha e devolve os relatórios das UGs com divergência,
 * ordenados pela diferença total. Lança quando a planilha está vazia ou quando
 * não encontra o cabeçalho.
 */
export const processData = (data: SheetRow[]): UGReport[] => {
	if (data.length === 0) throw new Error("A planilha está vazia.")

	const header = findHeaderColumns(data)

	if (header === null) {
		throw new Error("Não foi possível identificar as colunas 'UG', 'Conta Contábil' e 'Saldo - R$'. Verifique se elas existem na planilha.")
	}

	const linhas = readLinhas(data, header)

	// `agregarSaldos` SOMA por UG × conta. O relatório do Tesouro Gerencial pode
	// trazer mais de uma linha para o mesmo par (por conta corrente, mês ou fonte);
	// a versão anterior guardava só a última linha do arquivo e descartava o resto
	// em silêncio, produzindo divergência onde o par estava equilibrado.
	const ugs = agregarSaldos(linhas)

	const newReports: UGReport[] = []

	for (const ug in ugs) {
		const report = buildUgReport(ug, ugs[ug])
		if (report) newReports.push(report)
	}

	newReports.sort((a, b) => b.totalDiff - a.totalDiff)

	return newReports
}
