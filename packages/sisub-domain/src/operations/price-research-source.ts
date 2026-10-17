/**
 * A consulta à fonte oficial (Compras.gov.br, módulo Pesquisa de Preços) como a pesquisa a faz e a
 * registra. O app coleta (é HTTP), o domínio dita a regra de coleta, grava e descreve: o relatório
 * e a série dizem a consulta exata, a hora e se a janela foi lida inteira.
 *
 * A fonte devolve os registros em ordem DECRESCENTE de data do resultado (conferido em 2026-10-16
 * nas 8.402 linhas do CATMAT 463770, sem exceção), e a janela de 1 ano conta por essa data: a
 * coleta para na primeira linha que passa do início da janela, e a janela inteira vem lida
 * qualquer que seja o volume. O teto curto (`PRICE_RESEARCH_MAX_PAGES`) vale para a consulta sem
 * janela; com janela, o teto é o largo (`PRICE_RESEARCH_WINDOW_MAX_PAGES`), só freio contra fonte
 * patológica, porque a janela precisa vir inteira mesmo com a fonte fora de ordem.
 */

import { addCivilMonths, toBrasiliaCivilDate } from "../utils/civil-date.ts"

export const PRICE_RESEARCH_SOURCE_URL = "https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial"
export const PRICE_RESEARCH_SOURCE_DOCS_URL = "https://dadosabertos.compras.gov.br/swagger-ui/index.html"
export const PRICE_RESEARCH_PAGE_SIZE = 500
/** Teto sem janela (todo o histórico): 40 × 500 = 20.000 registros. */
export const PRICE_RESEARCH_MAX_PAGES = 40
/** Teto com janela: 200 × 500 = 100.000 registros. A janela precisa vir inteira; é só freio contra fonte patológica. */
export const PRICE_RESEARCH_WINDOW_MAX_PAGES = 200

/**
 * Quanto da consulta foi lido:
 * - `window`: parou na primeira linha que passou do início da janela e conferiu a última página
 *   (a janela inteira foi lida);
 * - `complete`: todas as páginas;
 * - `truncated`: parou no teto antes de cobrir a janela. Amostra parcial: não sustenta preço.
 */
export const SOURCE_COVERAGES = ["window", "complete", "truncated"] as const
export type SourceCoverage = (typeof SOURCE_COVERAGES)[number]

export const SOURCE_COVERAGE_LABELS: Record<SourceCoverage, string> = {
	window: "janela completa",
	complete: "todas as páginas",
	truncated: "parcial (teto de páginas)",
}

/** O que a pesquisa registra da consulta (colunas `source_*` de `procurement.price_research_item`). */
export interface PriceResearchSourceConsultation {
	/** Hora em que o servidor do sisub recebeu a página 1 (a API não informa a hora da consulta). */
	consultedAt: string
	/** Parâmetros da consulta, sem `pagina`, como foram enviados (`tipo=…&codigo=…&tamanhoPagina=…`). */
	query: string
	totalRecords: number
	totalPages: number
	/** Páginas lidas, contando a última página quando ela foi lida para conferir a ordem. */
	pagesFetched: number
	coverage: SourceCoverage
}

/** Parâmetros da consulta do sisub por CATMAT, sem `pagina`: o que `searchMaterialPricesFn` envia. */
export function priceResearchQueryString(catmat: number): string {
	return `tipo=codigoItemCatalogo&codigo=${catmat}&tamanhoPagina=${PRICE_RESEARCH_PAGE_SIZE}`
}

/** URL da página 1 de uma consulta registrada (as seguintes mudam `pagina`). */
export function priceResearchQueryUrl(query: string): string {
	return `${PRICE_RESEARCH_SOURCE_URL}?${query}&pagina=1`
}

/** URL que devolve, da fonte, só os registros de uma compra do CATMAT: confere um preço da série. */
export function priceResearchSampleUrl(catmat: number, idCompra: string): string {
	return `${PRICE_RESEARCH_SOURCE_URL}?tipo=codigoItemCatalogo&codigo=${catmat}&idCompra=${encodeURIComponent(idCompra)}&pagina=1&tamanhoPagina=${PRICE_RESEARCH_PAGE_SIZE}`
}

/** Hora da consulta em Brasília, `AAAA-MM-DD HH:MM:SS`, para a tela e o relatório. */
export function formatConsultedAt(iso: string): string {
	return new Intl.DateTimeFormat("sv-SE", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).format(new Date(iso))
}

/**
 * Início da janela de `months` meses contada do dia (em Brasília) da consulta. É o corte da coleta,
 * do cálculo (modal, lote e API) e o que o relatório declara: um só, para os quatro não divergirem.
 */
export function consultationWindowStart(consultedAt: string, months: number): string {
	return addCivilMonths(toBrasiliaCivilDate(consultedAt) ?? consultedAt.slice(0, 10), -months)
}

// ─── Coleta ─────────────────────────────────────────────────────────────────────

/** Uma página da consulta, como a fonte a devolve. `fetchedAt` é a hora do servidor que a recebeu. */
export interface SourcePage<T> {
	resultado: T[]
	totalRegistros: number
	totalPaginas: number
	fetchedAt?: string
}

export interface CollectedSource<T> {
	results: T[]
	consultation: PriceResearchSourceConsultation
	/** A fonte não veio em ordem de data do resultado: a coleta não soube onde a janela terminava. */
	orderBroken: boolean
}

type DatedRow = { dataResultado?: string | null }

/** Data pela qual a fonte ordena a resposta (decrescente) e pela qual a janela conta. */
const sortDateOf = (r: DatedRow) => r.dataResultado?.slice(0, 10) ?? null

/**
 * Coleta as páginas de uma consulta, em lotes de `concurrency`.
 *
 * Com janela, lê até a primeira linha cuja data do resultado passa do início dela, conferindo a
 * ordem linha a linha, e então lê a última página: ela precisa continuar a ordem. Linha sem data do
 * resultado (que a fonte não devolveu em nenhum dos CATMATs conferidos em 2026-10-17) ou fora de
 * ordem quebra a premissa, e a coleta lê a fonte inteira. Com janela, o teto é o largo, porque a
 * janela precisa vir inteira; sem janela, o curto. A última página lida para conferir é
 * reaproveitada e conta como lida.
 */
export async function collectSourcePages<T extends DatedRow>(options: {
	fetchPage: (pagina: number) => Promise<SourcePage<T>>
	query: string
	/** Janela em meses; null = todo o histórico. */
	periodMonths: number | null
	maxPages?: number
	windowMaxPages?: number
	concurrency?: number
	/** Pausa de cortesia entre lotes, em ms. */
	pauseMs?: number
	now?: () => Date
}): Promise<CollectedSource<T>> {
	const concurrency = options.concurrency ?? 4
	const cache = new Map<number, Promise<SourcePage<T>>>()
	const fetchPage = (pagina: number) => {
		let request = cache.get(pagina)
		if (!request) {
			request = options.fetchPage(pagina)
			cache.set(pagina, request)
		}
		return request
	}

	const first = await fetchPage(1)
	const consultedAt = first.fetchedAt ?? (options.now?.() ?? new Date()).toISOString()
	const cutoff = options.periodMonths ? consultationWindowStart(consultedAt, options.periodMonths) : null
	const totalPages = first.totalPaginas
	const limit = Math.min(totalPages, cutoff ? (options.windowMaxPages ?? PRICE_RESEARCH_WINDOW_MAX_PAGES) : (options.maxPages ?? PRICE_RESEARCH_MAX_PAGES))
	const pages: T[][] = []

	let ordered = true
	let lastSortDate: string | null = null
	const continuesOrder = (rows: readonly T[], from: string | null) => {
		let previous = from
		for (const r of rows) {
			const date = sortDateOf(r)
			if (!date || (previous && date > previous)) return { ok: false, last: previous }
			previous = date
		}
		return { ok: true, last: previous }
	}
	const take = (rows: T[]) => {
		pages.push(rows)
		if (!ordered) return
		const step = continuesOrder(rows, lastSortDate)
		ordered = step.ok
		lastSortDate = step.last
	}
	const passedWindowStart = () => cutoff != null && ordered && lastSortDate != null && lastSortDate < cutoff
	let stopAtWindow = true
	const readUpTo = async () => {
		while (pages.length < limit && !(stopAtWindow && passedWindowStart())) {
			const start = pages.length + 1
			const end = Math.min(start + concurrency - 1, limit)
			const batch = await Promise.all(Array.from({ length: end - start + 1 }, (_, i) => fetchPage(start + i)))
			for (const page of batch) take(page.resultado)
			if (pages.length < limit && options.pauseMs) await new Promise((r) => setTimeout(r, options.pauseMs))
		}
	}

	take(first.resultado)
	await readUpTo()
	let stoppedAtWindow = false
	let checkedLastPage = false
	if (pages.length < totalPages && passedWindowStart()) {
		checkedLastPage = true
		const last = (await fetchPage(totalPages)).resultado
		if (continuesOrder(last, lastSortDate).ok) stoppedAtWindow = true
		else {
			ordered = false
			stopAtWindow = false
			await readUpTo()
		}
	}

	const coverage: SourceCoverage = pages.length >= totalPages ? "complete" : stoppedAtWindow ? "window" : "truncated"
	const pagesFetched = Math.min(pages.length + (checkedLastPage && pages.length < totalPages ? 1 : 0), totalPages)
	return {
		results: pages.flat(),
		consultation: { consultedAt, query: options.query, totalRecords: first.totalRegistros, totalPages, pagesFetched, coverage },
		orderBroken: !ordered,
	}
}
