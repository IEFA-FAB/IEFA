// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): leitura do
// relatório do Tesouro Gerencial (cabeçalho na linha 12) e agrupamento por UG das
// linhas com código genérico na conta corrente. Era o corpo do `reader.onload` de
// `processFile`. O que é código genérico, e de que tipo, mora em `generic-code.ts`.
import * as XLSX from "xlsx"
import { parseBrazilianAmountOrZero } from "#/lib/analysis/saldo"
import { readWorkbook } from "#/lib/spreadsheet"
import { classifyGenericCode } from "#/subitens/generic-code"
import type { ProcessedData, UgGroup } from "#/subitens/types"

interface ReportColumns {
	ugCol: string
	contaCol: string
	ccCol: string
	saldoCol: string
}

/** Primeiro cabeçalho igual a um dos nomes ou que contenha um deles (sem caixa nem espaços nas pontas). */
const findColumn = (firstRow: Record<string, unknown>, possibleNames: string[]) => {
	const keys = Object.keys(firstRow)
	return keys.find(
		(k) =>
			possibleNames.some((p) => k.toLowerCase().trim() === p.toLowerCase().trim()) ||
			possibleNames.some((p) => k.toLowerCase().trim().includes(p.toLowerCase().trim()))
	)
}

/** Colunas do relatório pelo cabeçalho da primeira linha de dados; lança listando as que faltam. */
function resolveColumns(firstRow: Record<string, unknown>): ReportColumns {
	const ugCol = findColumn(firstRow, ["UG", "UG Executora"])
	const contaCol = findColumn(firstRow, ["Conta Contábil", "Conta"])
	const ccCol = findColumn(firstRow, ["Conta Corrente", "CC", "Corrente"])
	const saldoCol = findColumn(firstRow, ["Saldo - R$", "Saldo", "Valor"])

	if (!ugCol || !contaCol || !ccCol || !saldoCol) {
		const missing = (
			[
				[ugCol, "UG Executora"],
				[contaCol, "Conta Contábil"],
				[ccCol, "Conta Corrente"],
				[saldoCol, "Saldo"],
			] as const
		)
			.filter(([col]) => !col)
			.map(([, label]) => label)
		throw new Error(`Não foi possível identificar as colunas: ${missing.join(", ")}. Verifique o cabeçalho da planilha.`)
	}
	return { ugCol, contaCol, ccCol, saldoCol }
}

/**
 * Saldo da célula pela regra compartilhada (`parseBrazilianAmount`); o que não for número
 * vira 0, como antes. A cópia antiga tirava todo ponto ("1500.25" virava 150025) e não
 * lia parênteses.
 */
export function parseSaldo(saldoRaw: unknown): number {
	return parseBrazilianAmountOrZero(saldoRaw)
}

const toProcessedRow = (row: Record<string, unknown>, { ugCol, contaCol, ccCol, saldoCol }: ReportColumns): ProcessedData => {
	const contaCorrente = String(row[ccCol] ?? "").trim()
	return {
		ug: String(row[ugCol]).trim(),
		contaContabil: String(row[contaCol]).trim(),
		contaCorrente,
		genericKinds: classifyGenericCode(contaCorrente),
		saldo: parseSaldo(row[saldoCol]),
		racId: "RAC 28",
	}
}

/** Agrupa por UG somando o saldo de linhas repetidas (mesma conta contábil e conta corrente). */
function groupByUg(filtered: ProcessedData[]): UgGroup[] {
	const groups: Record<string, UgGroup> = {}
	for (const row of filtered) {
		if (!groups[row.ug]) groups[row.ug] = { ug: row.ug, occurrences: [], totalSaldo: 0 }
		const existing = groups[row.ug].occurrences.find((o) => o.contaContabil === row.contaContabil && o.contaCorrente === row.contaCorrente)
		if (existing) {
			existing.saldo += row.saldo
		} else {
			groups[row.ug].occurrences.push({ ...row })
		}
		groups[row.ug].totalSaldo += row.saldo
	}

	return Object.values(groups).sort((a, b) => a.ug.localeCompare(b.ug))
}

/**
 * Lê a planilha e devolve as UGs com código genérico na conta corrente, em ordem de UG. Lança com a
 * mensagem que a tela mostra quando a planilha está vazia ou falta coluna; lista vazia
 * (nenhum código genérico) fica para quem chama decidir.
 */
export function parseWorkbook(bstr: string | ArrayBuffer | null | undefined): UgGroup[] {
	const workbook = readWorkbook(bstr)
	const sheetName = workbook.SheetNames[0]
	const worksheet = workbook.Sheets[sheetName]

	const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", range: 11 })

	if (jsonData.length === 0) throw new Error("O arquivo está vazio ou não contém dados válidos.")

	const columns = resolveColumns(jsonData[0])

	const filtered: ProcessedData[] = jsonData
		.map((row: Record<string, unknown>) => toProcessedRow(row, columns))
		.filter((row: ProcessedData) => row.genericKinds.length > 0)

	return groupByUg(filtered)
}
