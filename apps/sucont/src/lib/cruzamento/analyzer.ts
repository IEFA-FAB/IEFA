import * as XLSX from "xlsx"
import { parseBrazilianAmountOrZero } from "#/lib/analysis/saldo"
import { arredondarCentavos, saldosDivergem, saldoZerado } from "#/lib/analysis/tolerancia"
import { UG_DATA } from "#/lib/cruzamento/ugData"
import { readWorkbook } from "#/lib/spreadsheet"
import { getConferente, isUgAcompanhada } from "#/lib/ug/registry"

/**
 * Contas do par espelhado da Questão 22 do RAC.
 *
 * `897110300` (8.9.7.1.1.03.00, responsabilidade de terceiros) e `897210300`
 * (8.9.7.2.1.03.00, execução de responsabilidades) devem fechar por conta
 * corrente. A exigência de igualdade é do RAC/SUCONT-3: pelas regras de
 * integridade do PCASP (MCASP, item 3.5) as classes 7 e 8 não são contrapartida
 * uma da outra e o par se move verticalmente dentro da classe 8 — o espelhamento
 * decorre da rotina adotada no COMAER, não do plano de contas.
 */
export const CONTA_RESPONSABILIDADE = "897110300"
export const CONTA_EXECUCAO_RESPONSABILIDADE = "897210300"

/**
 * Única UG autorizada a registrar saldo na conta de execução de responsabilidade.
 *
 * REGRA INTERNA, sem norma federal citável: `120052` é a SDPP/PAÍS. Saldo de
 * qualquer outra UG na `897210300` é classificado como crítico. Enquanto a
 * decisão que institui a restrição não for referenciada aqui, o texto gerado deve
 * dizer que a exigência é da Setorial, e não da União.
 */
export const UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE = "120052"

export interface RawRecord {
	UG: string
	ContaContabil: string
	ContaCorrente: string
	Saldo: number
}

export interface AnalysisResult {
	contaCorrente: string
	status: "REGULAR" | "AUSÊNCIA NA 897110300" | "AUSÊNCIA NA 897210300" | "DIVERGÊNCIA DE SALDO" | "UG INDEVIDA NA 897210300"
	ug8972: string
	saldo8972: number | null
	ug8971: string
	saldo8971: number | null
	diferenca: number
}

export interface UGAnalysis {
	ug: string
	ugName?: string
	orgaoSuperior?: string
	ods?: string
	conferente: string
	status: "REGULAR" | "ATENÇÃO" | "CRÍTICA"
	inconsistenciesCount: number
	financialImpact: number
	details: AnalysisResult[]
	diagnosis: string[]
}

export interface DashboardStats {
	totalUgs: number
	ugsRegulares: number
	ugsAtencao: number
	ugsCriticas: number
	synthesis: string
}

export interface ReportData {
	stats: DashboardStats
	ugAnalysis: UGAnalysis[]
	ranking: UGAnalysis[]
}

/**
 * Saldo da célula pela regra compartilhada (`parseBrazilianAmount`); o que não for número
 * vira 0, como antes. Recebe o valor CRU da célula (`raw: true`): número passa direto e
 * texto é o que foi digitado, na convenção brasileira.
 */
export function parseSaldoCell(value: unknown): number {
	return parseBrazilianAmountOrZero(value)
}

/** Texto da célula como a planilha o mostra (`w`), ou o valor como texto; vazio sem célula. */
function cellText(cell: XLSX.CellObject | undefined): string {
	if (!cell || cell.v == null) return ""
	return cell.w ?? String(cell.v)
}

/** Primeira coluna, da esquerda para a direita, cujo cabeçalho contém um dos nomes (sem espaço, sem caixa); -1 se nenhuma. */
function findColumn(headers: Map<number, string>, searchKeys: string[]): number {
	const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, "")
	for (const [column, header] of headers) {
		if (searchKeys.some((searchKey) => normalize(header).includes(normalize(searchKey)))) return column
	}
	return -1
}

/**
 * Linhas do relatório a partir do conteúdo do arquivo (xlsx, xls ou CSV), numa passada só
 * pelas células, com as linhas e colunas absolutas do `!ref` (a dimensão pode começar em
 * A3, e o cabeçalho tem de ser procurado e lido na mesma régua).
 *
 * - Identificadores (UG, conta, conta corrente) saem do texto formatado (`cell.w`), para
 *   não perder o zero à esquerda de um conta corrente com formato "00000".
 * - O saldo sai do valor CRU (`cell.v`). O texto formatado do SheetJS é inglês: a célula
 *   Geral com 123,456 mostra "123.456", que pela regra brasileira viraria 123456. Cru, ela
 *   é o número 123.456, e só a célula de texto ("1.234,56", digitado ou exportado como
 *   texto) passa pelo parser brasileiro.
 *
 * CSV passa por `readWorkbook`: encoding decidido pelos bytes e célula como texto digitado.
 */
export function readRecords(data: ArrayBuffer | Uint8Array): RawRecord[] {
	const workbook = readWorkbook(data)
	const worksheet = workbook.Sheets[workbook.SheetNames[0]]
	const headerNotFound = new Error("Cabeçalho da tabela não encontrado. A planilha deve conter as colunas UG, Conta Contábil, Conta Corrente e Saldo.")
	const ref = worksheet?.["!ref"]
	if (!ref) throw headerNotFound
	const range = XLSX.utils.decode_range(ref)
	const cellAt = (r: number, c: number) => worksheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined

	let headerRow = -1
	const headers = new Map<number, string>()
	for (let r = range.s.r; r <= range.e.r && headerRow === -1; r++) {
		const rowTexts = new Map<number, string>()
		for (let c = range.s.c; c <= range.e.c; c++) {
			const text = cellText(cellAt(r, c))
			if (text) rowTexts.set(c, text)
		}
		const rowStr = Array.from(rowTexts.values()).join(" ").toLowerCase()
		if (rowStr.includes("ug") && rowStr.includes("conta") && rowStr.includes("corrente")) {
			headerRow = r
			for (const [c, text] of rowTexts) headers.set(c, text)
		}
	}
	if (headerRow === -1) throw headerNotFound

	const ugColumn = findColumn(headers, ["UG", "UnidadeGestora"])
	const contaColumn = findColumn(headers, ["ContaContábil", "ContaContabil"])
	const contaCorrenteColumn = findColumn(headers, ["ContaCorrente"])
	const saldoColumn = findColumn(headers, ["Saldo", "Valor"])
	const textAt = (r: number, c: number) => (c === -1 ? "" : cellText(cellAt(r, c)).trim())

	const records: RawRecord[] = []
	for (let r = headerRow + 1; r <= range.e.r; r++) {
		const record: RawRecord = {
			UG: textAt(r, ugColumn),
			ContaContabil: textAt(r, contaColumn),
			ContaCorrente: textAt(r, contaCorrenteColumn),
			Saldo: saldoColumn === -1 ? 0 : parseSaldoCell(cellAt(r, saldoColumn)?.v),
		}
		if (record.UG && record.ContaContabil && record.ContaCorrente) records.push(record)
	}
	return records
}

export function parseFile(file: File): Promise<RawRecord[]> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = (e) => {
			try {
				resolve(readRecords(new Uint8Array(e.target?.result as ArrayBuffer)))
			} catch (err) {
				reject(err)
			}
		}
		reader.onerror = reject
		reader.readAsArrayBuffer(file)
	})
}

/** Linha de uma das duas contas do cruzamento (897210300 × 897110300). */
function ehContaDoPar(contaContabil: string): boolean {
	return contaContabil === CONTA_EXECUCAO_RESPONSABILIDADE || contaContabil === CONTA_RESPONSABILIDADE
}

/** Acumulado de um conta corrente nas duas contas do par. */
interface ContaCorrenteEntry {
	ug8972: Set<string>
	saldo8972: number
	has8972: boolean
	ug8971: Set<string>
	saldo8971: number
	has8971: boolean
}

function aggregateByContaCorrente(records: RawRecord[]): Map<string, ContaCorrenteEntry> {
	const map = new Map<string, ContaCorrenteEntry>()

	// Conta corrente com alguma linha fora do acompanhamento (a STN) sai INTEIRO da
	// análise. Descartar só a linha dela desmancharia o par: o lado que sobra vira
	// AUSÊNCIA ou DIVERGÊNCIA cobrada da UG do COMAER, que não tem o que corrigir.
	const contasCorrentesExcluidas = new Set(records.filter((r) => !isUgAcompanhada(r.UG) && ehContaDoPar(r.ContaContabil)).map((r) => r.ContaCorrente))

	for (const record of records) {
		if (!ehContaDoPar(record.ContaContabil)) continue
		if (contasCorrentesExcluidas.has(record.ContaCorrente)) continue

		if (!map.has(record.ContaCorrente)) {
			map.set(record.ContaCorrente, {
				ug8972: new Set(),
				saldo8972: 0,
				has8972: false,
				ug8971: new Set(),
				saldo8971: 0,
				has8971: false,
			})
		}

		const entry = map.get(record.ContaCorrente)
		if (!entry) continue

		if (record.ContaContabil === CONTA_EXECUCAO_RESPONSABILIDADE) {
			entry.ug8972.add(record.UG)
			entry.saldo8972 += record.Saldo
			entry.has8972 = true
		} else if (record.ContaContabil === CONTA_RESPONSABILIDADE) {
			entry.ug8971.add(record.UG)
			entry.saldo8971 += record.Saldo
			entry.has8971 = true
		}
	}

	return map
}

function createUGAnalysis(ug: string): UGAnalysis {
	const info = UG_DATA[ug]
	return {
		ug,
		ugName: info?.nome || "Desconhecida",
		orgaoSuperior: info?.orgaoSuperior || "-",
		ods: info?.ods || "-",
		conferente: getConferente(ug),
		status: "REGULAR",
		inconsistenciesCount: 0,
		financialImpact: 0,
		details: [],
		diagnosis: [],
	}
}

/** UG que responde pelo apontamento: a indevida na 8972, senão quem registrou a 8971, senão a da 8972. */
function pickTargetUG(invalidUGs8972: string[], ugs8971: string[], ugs8972: string[]): string {
	let targetUG = "NÃO IDENTIFICADA"

	if (invalidUGs8972.length > 0) {
		targetUG = invalidUGs8972[0]
	} else if (ugs8971.length > 0) {
		targetUG = ugs8971[0]
	} else if (ugs8972.length > 0) {
		targetUG = ugs8972[0]
	}

	return targetUG
}

function classifyContaCorrente(data: ContaCorrenteEntry, hasInvalidUG8972: boolean, val8972: number, val8971: number): AnalysisResult["status"] {
	if (saldoZerado(val8972) && saldoZerado(val8971)) {
		return "REGULAR"
	} else if (hasInvalidUG8972 && !saldoZerado(val8972)) {
		return "UG INDEVIDA NA 897210300"
	} else if (!saldosDivergem(val8972, val8971)) {
		return "REGULAR"
	} else if (data.has8972 && !data.has8971) {
		return "AUSÊNCIA NA 897110300"
	} else if (!data.has8972 && data.has8971) {
		return "AUSÊNCIA NA 897210300"
	}
	return "DIVERGÊNCIA DE SALDO"
}

/** Compara as duas pernas de um conta corrente e diz qual UG responde pelo resultado. */
function analyzeContaCorrente(contaCorrente: string, data: ContaCorrenteEntry): { result: AnalysisResult; targetUG: string } {
	const saldo8972 = data.has8972 ? arredondarCentavos(data.saldo8972) : null
	const saldo8971 = data.has8971 ? arredondarCentavos(data.saldo8971) : null

	// Ordenar antes de escolher: `Set` preserva ordem de inserção, ou seja, a ordem
	// das linhas na planilha. Sem isto, com mais de uma UG no mesmo conta corrente a
	// responsabilidade pelo apontamento mudava conforme o arquivo fosse ordenado.
	const ugs8972 = Array.from(data.ug8972).sort()
	const ugs8971 = Array.from(data.ug8971).sort()
	const invalidUGs8972 = ugs8972.filter((ug) => ug !== UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE)
	const hasInvalidUG8972 = invalidUGs8972.length > 0

	const targetUG = pickTargetUG(invalidUGs8972, ugs8971, ugs8972)

	const diferenca = arredondarCentavos(Math.abs((saldo8972 || 0) - (saldo8971 || 0)))

	const val8972 = saldo8972 || 0
	const val8971 = saldo8971 || 0

	const status = classifyContaCorrente(data, hasInvalidUG8972, val8972, val8971)

	const result: AnalysisResult = {
		contaCorrente,
		status,
		ug8972: Array.from(data.ug8972).join(", ") || "-",
		saldo8972,
		ug8971: Array.from(data.ug8971).join(", ") || "-",
		saldo8971,
		diferenca,
	}

	return { result, targetUG }
}

function registerInconsistency(ugAnalysis: UGAnalysis, result: AnalysisResult): void {
	const { status } = result
	if (status === "REGULAR") return

	ugAnalysis.details.push(result)
	ugAnalysis.inconsistenciesCount++
	ugAnalysis.financialImpact += result.diferenca

	if (status.includes("AUSÊNCIA") || status === "UG INDEVIDA NA 897210300") {
		ugAnalysis.status = "CRÍTICA"
	} else if (status === "DIVERGÊNCIA DE SALDO" && ugAnalysis.status !== "CRÍTICA") {
		ugAnalysis.status = "ATENÇÃO"
	}
}

/** Causas prováveis por tipo de apontamento, na ordem em que entram no diagnóstico. */
const CAUSES_BY_STATUS: Record<AnalysisResult["status"], string[]> = {
	REGULAR: [],
	"AUSÊNCIA NA 897110300": ["Falta de apropriação da responsabilidade de terceiros (A Receber)", "Baixa indevida na conta 897110300"],
	"AUSÊNCIA NA 897210300": ["Falta de apropriação da responsabilidade da UG", "Baixa indevida na conta 897210300"],
	"DIVERGÊNCIA DE SALDO": [
		"Divergência entre o direito a receber (8971) e a responsabilidade registrada (8972)",
		"Estorno parcial ou baixa não refletida em ambas as contas",
	],
	"UG INDEVIDA NA 897210300": [
		`Registro na conta ${CONTA_EXECUCAO_RESPONSABILIDADE} por UG diferente da ${UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE}, única autorizada por definição desta Setorial`,
	],
}

function diagnoseUG(details: AnalysisResult[]): string[] {
	const causes = new Set<string>()
	for (const detail of details) {
		for (const cause of CAUSES_BY_STATUS[detail.status]) causes.add(cause)
	}
	return Array.from(causes)
}

function compareByImpact(a: UGAnalysis, b: UGAnalysis): number {
	if (b.financialImpact !== a.financialImpact) {
		return b.financialImpact - a.financialImpact
	}
	return b.inconsistenciesCount - a.inconsistenciesCount
}

function buildSynthesis(ranking: UGAnalysis[]): string {
	const criticalUgs = ranking.filter((u) => u.status === "CRÍTICA").map((u) => u.ug)
	const topUg = ranking.length > 0 && ranking[0].financialImpact > 0 ? ranking[0].ug : null

	if (criticalUgs.length > 0 && topUg) {
		return `Verifica-se concentração de inconsistências nas UGs ${criticalUgs.join(", ")}, com maior impacto financeiro na UG ${topUg}, demandando atuação prioritária.`
	} else if (topUg) {
		return `Verifica-se inconsistências com maior impacto financeiro na UG ${topUg}, demandando atuação prioritária.`
	}
	return "Não foram encontradas inconsistências significativas nas UGs analisadas."
}

export function analyzeData(records: RawRecord[]): ReportData {
	const map = aggregateByContaCorrente(records)

	const ugMap = new Map<string, UGAnalysis>()

	const getOrCreateUG = (ug: string) => {
		if (!ugMap.has(ug)) {
			ugMap.set(ug, createUGAnalysis(ug))
		}
		const ugEntry = ugMap.get(ug)
		if (!ugEntry) throw new Error(`UG ${ug} not found in map after creation`)
		return ugEntry
	}

	for (const [contaCorrente, data] of map.entries()) {
		if (!data.has8971 && !data.has8972) continue

		const { result, targetUG } = analyzeContaCorrente(contaCorrente, data)
		registerInconsistency(getOrCreateUG(targetUG), result)
	}

	for (const ugAnalysis of ugMap.values()) {
		ugAnalysis.diagnosis = diagnoseUG(ugAnalysis.details)
	}

	const ugList = Array.from(ugMap.values())

	const ranking = [...ugList].sort(compareByImpact)

	const stats: DashboardStats = {
		totalUgs: ugList.length,
		ugsRegulares: ugList.filter((u) => u.status === "REGULAR").length,
		ugsAtencao: ugList.filter((u) => u.status === "ATENÇÃO").length,
		ugsCriticas: ugList.filter((u) => u.status === "CRÍTICA").length,
		synthesis: buildSynthesis(ranking),
	}

	return {
		stats,
		ugAnalysis: ugList,
		ranking,
	}
}
