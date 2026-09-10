/**
 * @module auditor/services/report
 * Recorte numérico da Nota Analítica Estratégica.
 *
 * A nota é escrita por modelo, mas os NÚMEROS não são dele: totais, tabela das
 * maiores divergências, tendências e composição por grupo saem daqui, do mesmo
 * dado que a tela desenha, e são renderizados pelo montador de Markdown. Ao modelo
 * cabe a leitura — o texto do sumário, os alertas, o plano de ação.
 *
 * A versão de origem (`lsantosnels/SIAFI-x-SILOMS-Auditor`, `services/aiService.ts`)
 * mandava a tabela no prompt e pedia ao modelo que a reproduzisse em Markdown, com
 * a instrução "a tabela deve ser impecável". Reproduzir 20 linhas de valores é
 * exatamente o que um LLM erra em silêncio, e a nota vai assinada pela SUCONT-4.
 *
 * Correções de conteúdo em relação à origem, todas de leitura do número:
 *  - o total dos módulos era chamado de "Diferença Líquida Total". Não é líquida:
 *    é a soma de `|SIAFI − SILOMS|`, que não compensa sobra com falta. As duas
 *    passaram a existir separadas (`absolute` e `net`), porque a diferença entre
 *    elas é justamente o diagnóstico;
 *  - "as 5 UGs que mais reduziram" saía de um `sort` sobre a mesma lista já
 *    ordenada, sem filtrar o sinal: numa competência com menos de cinco reduções,
 *    entravam UGs que tinham AUMENTADO;
 *  - a variação percentual caía em `100` quando não havia base anterior — o mesmo
 *    "+100%" contra competência inexistente que o `hasPrevious` fechou no resto do
 *    auditor. Aqui é `null`, e o montador imprime travessão.
 */

import { AccountGroup, type FinancialRecord, type TimeFilter } from "../types"
import { recalculateDeltas, toShortDate } from "./dataProcessor"
import { detectInterOmTransfers, type InterOmTransfer } from "./inter-om"

/** Quantas UGs entram na tabela de maiores divergências. */
export const TOP_OFFENDERS = 20

/** Quantas UGs por sentido (agravamento / melhoria) em cada escopo de tendência. */
export const TREND_SIZE = 5

/** Escopos de tendência apresentados na nota, sempre os três. */
export const TREND_SCOPES: readonly TimeFilter[] = ["MENSAL", "TRIMESTRAL", "SEMESTRAL"] as const

/** Passo em meses de cada escopo — mesma tabela do `recalculateDeltas`. */
export const SCOPE_GAP: Record<TimeFilter, number> = { MENSAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 }

/**
 * O registro tem saldo em pelo menos um dos sistemas?
 *
 * `normalizeData` materializa os TRÊS grupos de contas para toda linha do
 * arquivo, mesmo quando nenhum dos dois sistemas reporta nada naquele grupo. Isso
 * é conveniente para o cruzamento, e veneno para qualquer agregado: numa
 * competência com 84 UGs entram ~170 registros de zero absoluto, que enchem a
 * tabela das maiores divergências com linhas de R$ 0,00, contam como
 * "equilibrados" na preponderância — como se estivessem conciliados, quando na
 * verdade não foram reportados — e inflam a contagem de UGs de cada grupo.
 *
 * Zero nos DOIS sistemas é ausência de saldo, não conciliação. Saldo igual e
 * não-nulo nos dois É conciliação, e continua contando.
 */
export const hasBalance = (record: Pick<FinancialRecord, "siafiValue" | "silomsValue">) => record.siafiValue !== 0 || record.silomsValue !== 0

export interface ReportTotals {
	siafi: number
	siloms: number
	/** Soma de `|SIAFI − SILOMS|` — o que a UG tem de conciliar. */
	absoluteDifference: number
	/** Soma de `SIAFI − SILOMS` com sinal — sobra e falta se compensam. */
	netDifference: number
}

export interface ReportOffender {
	ug: string
	cod: string
	group: string
	siafi: number
	siloms: number
	difference: number
	preponderance: "SIAFI" | "SILOMS" | "EQUAL"
	riskLevel?: string
}

export interface ReportTrendItem {
	ug: string
	cod: string
	group: string
	/** Variação da divergência contra o período anterior do escopo (com sinal). */
	delta: number
	/** Percentual sobre a divergência anterior. `null` quando ela era zero. */
	deltaPct: number | null
	difference: number
	previousDifference: number
	previousDate: string
}

export interface ReportTrendScope {
	scope: TimeFilter
	worsening: ReportTrendItem[]
	improving: ReportTrendItem[]
}

export interface ReportGroupSummary {
	group: string
	siafi: number
	siloms: number
	difference: number
	ugCount: number
}

export interface ReportDataset {
	/** Competência analisada (`YYYY-MM`). */
	competence: string
	/** A mesma competência como a tela a escreve (`JUL/25`). */
	competenceLabel: string
	timeFilter: TimeFilter
	/** Recorte de hierarquia ativo na tela, em uma linha. */
	scopeLabel: string
	/** Competências distintas presentes na base carregada. */
	periodsLoaded: number
	ugCount: number
	recordCount: number
	totals: ReportTotals
	/** Período anterior segundo o escopo. `null` quando ele não está na base. */
	previous: { period: string; label: string; totals: ReportTotals } | null
	preponderance: { siafi: number; siloms: number; equal: number }
	groups: ReportGroupSummary[]
	topOffenders: ReportOffender[]
	trends: ReportTrendScope[]
	interOm: InterOmTransfer[]
}

export interface BuildReportInput {
	/** Série normalizada, já filtrada pelo recorte da tela. Todas as competências. */
	data: FinancialRecord[]
	/** Competência de referência da nota (`YYYY-MM`). */
	competence: string
	timeFilter: TimeFilter
	/** Como descrever o recorte ativo — "todas as UGs", "ODS COMGAP", etc. */
	scopeLabel: string
}

function sumTotals(records: FinancialRecord[]): ReportTotals {
	let siafi = 0
	let siloms = 0
	let absoluteDifference = 0
	for (const r of records) {
		siafi += r.siafiValue
		siloms += r.silomsValue
		absoluteDifference += r.difference
	}
	return { siafi, siloms, absoluteDifference, netDifference: siafi - siloms }
}

/** `2025-07` menos `gap` meses. */
export function shiftPeriod(period: string, gap: number): string {
	const [yearStr, monthStr] = period.split("-")
	let year = Number.parseInt(yearStr, 10)
	let month = Number.parseInt(monthStr, 10) - gap
	while (month <= 0) {
		month += 12
		year -= 1
	}
	return `${year}-${month.toString().padStart(2, "0")}`
}

function toTrendItem(record: FinancialRecord): ReportTrendItem {
	const previousDifference = record.previousDifference ?? 0
	const delta = record.delta ?? 0
	return {
		ug: record.ug,
		cod: record.cod,
		group: record.group,
		delta,
		// Sem base anterior não existe percentual: `delta / 0` é infinito e o "+100%"
		// que a origem usava no lugar é uma afirmação sobre um número que não existe.
		deltaPct: previousDifference > 0 ? (delta / previousDifference) * 100 : null,
		difference: record.difference,
		previousDifference,
		previousDate: record.previousDate ?? "",
	}
}

function buildTrends(data: FinancialRecord[], competence: string): ReportTrendScope[] {
	return TREND_SCOPES.map((scope) => {
		// `hasPrevious` é o que separa "a divergência não mudou" de "o período
		// anterior não está na base". Só o primeiro é tendência.
		const movers = recalculateDeltas(data, scope).filter((r) => r.date === competence && r.hasPrevious === true && (r.delta ?? 0) !== 0)

		// O sinal é filtrado ANTES do corte: sem isso uma competência com três
		// reduções devolve cinco "melhorias", duas delas com aumento.
		const worsening = movers
			.filter((r) => (r.delta ?? 0) > 0)
			.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
			.slice(0, TREND_SIZE)
			.map(toTrendItem)

		const improving = movers
			.filter((r) => (r.delta ?? 0) < 0)
			.sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
			.slice(0, TREND_SIZE)
			.map(toTrendItem)

		return { scope, worsening, improving }
	})
}

function buildGroups(current: FinancialRecord[]): ReportGroupSummary[] {
	// Ordem fixa dos três grupos, e não a de aparição: a nota é comparada entre
	// competências, e uma seção que troca de ordem sozinha não é comparável.
	const order = [AccountGroup.BMP, AccountGroup.CONSUMO, AccountGroup.INTANGIVEL]
	const out: ReportGroupSummary[] = []

	for (const group of order) {
		const rows = current.filter((r) => r.group === group)
		if (rows.length === 0) continue
		const totals = sumTotals(rows)
		out.push({
			group,
			siafi: totals.siafi,
			siloms: totals.siloms,
			difference: totals.absoluteDifference,
			ugCount: new Set(rows.map((r) => r.cod)).size,
		})
	}

	return out
}

/**
 * Monta o recorte que alimenta a nota.
 *
 * Recalcula os deltas por conta própria em vez de receber a série já com eles: a
 * nota apresenta TRÊS escopos de tendência ao mesmo tempo, e o estado da tela
 * carrega só um. Depender do que a tela tinha em mãos faria duas das três seções
 * descreverem o período errado.
 */
export function buildReportDataset(input: BuildReportInput): ReportDataset {
	const { data, competence, timeFilter, scopeLabel } = input

	const currentScope = recalculateDeltas(data, timeFilter)
	// `hasBalance` aqui, e não em cada agregado: todo número da nota sai deste
	// recorte, e um filtro por agregado é um filtro que um agregado novo esquece.
	const current = currentScope.filter((r) => r.date === competence && hasBalance(r))

	const previousPeriod = shiftPeriod(competence, SCOPE_GAP[timeFilter] ?? 1)
	const previousRows = data.filter((r) => r.date === previousPeriod && hasBalance(r))

	const totals = sumTotals(current)

	const topOffenders: ReportOffender[] = [...current]
		.sort((a, b) => b.difference - a.difference)
		.slice(0, TOP_OFFENDERS)
		.map((r) => ({
			ug: r.ug,
			cod: r.cod,
			group: r.group,
			siafi: r.siafiValue,
			siloms: r.silomsValue,
			difference: r.difference,
			preponderance: r.preponderance,
			riskLevel: r.riskLevel,
		}))

	return {
		competence,
		competenceLabel: toShortDate(competence),
		timeFilter,
		scopeLabel,
		periodsLoaded: new Set(data.map((r) => r.date)).size,
		ugCount: new Set(current.map((r) => r.cod)).size,
		recordCount: current.length,
		totals,
		// Competência anterior ausente da base é `null`, não uma linha de zeros: a
		// segunda seria lida como "no período anterior estava tudo conciliado".
		previous: previousRows.length > 0 ? { period: previousPeriod, label: toShortDate(previousPeriod), totals: sumTotals(previousRows) } : null,
		preponderance: {
			siafi: current.filter((r) => r.preponderance === "SIAFI").length,
			siloms: current.filter((r) => r.preponderance === "SILOMS").length,
			equal: current.filter((r) => r.preponderance === "EQUAL").length,
		},
		groups: buildGroups(current),
		topOffenders,
		trends: buildTrends(data, competence),
		// A hipótese de transferência é sempre MENSAL: ela descreve um movimento
		// entre duas competências consecutivas. Lida sobre um passo semestral, o
		// "casamento" cruzaria seis meses de escrituração das duas pontas.
		interOm: detectInterOmTransfers(recalculateDeltas(data, "MENSAL").filter((r) => r.date === competence)),
	}
}
