/**
 * A consulta à fonte oficial (Compras.gov.br, módulo Pesquisa de Preços) como a pesquisa a faz e a
 * registra. O app coleta (é HTTP), o domínio grava e descreve: o relatório e a série dizem a
 * consulta, a hora e se a janela foi lida inteira.
 *
 * A consulta é sempre a mesma: o CATMAT pelo par `tipo`/`codigo`, em todo o país, página a
 * página. A fonte devolve os registros em ordem DECRESCENTE de data do resultado (conferido em
 * 2026-10-16 nas 8.402 linhas do CATMAT 463770, sem exceção), e a janela de 1 ano conta por
 * essa data: a coleta para na primeira página que passa do início da janela, e a janela inteira
 * vem lida qualquer que seja o volume do CATMAT. O teto de páginas só alcança a consulta sem
 * janela (todo o histórico) ou a fonte fora de ordem.
 */

export const PRICE_RESEARCH_SOURCE_URL = "https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial"
export const PRICE_RESEARCH_SOURCE_DOCS_URL = "https://dadosabertos.compras.gov.br/swagger-ui/index.html"
export const PRICE_RESEARCH_PAGE_SIZE = 500
/** Teto de páginas por CATMAT (40 × 500 = 20.000 registros). Freio contra rajada na API pública. */
export const PRICE_RESEARCH_MAX_PAGES = 40

/**
 * Quanto da consulta foi lido:
 * - `window`: parou na primeira página que passou do início da janela (a janela inteira foi lida);
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
	totalRecords: number
	totalPages: number
	pagesFetched: number
	coverage: SourceCoverage
}

/** URL da consulta de um CATMAT, como a pesquisa a fez (a página 1; as seguintes mudam `pagina`). */
export function priceResearchQueryUrl(catmat: number, pagina = 1): string {
	return `${PRICE_RESEARCH_SOURCE_URL}?tipo=codigoItemCatalogo&codigo=${catmat}&pagina=${pagina}&tamanhoPagina=${PRICE_RESEARCH_PAGE_SIZE}`
}

/** URL que devolve, da fonte, só os registros de uma compra do CATMAT: confere um preço da série. */
export function priceResearchSampleUrl(catmat: number, idCompra: string): string {
	return `${PRICE_RESEARCH_SOURCE_URL}?tipo=codigoItemCatalogo&codigo=${catmat}&idCompra=${encodeURIComponent(idCompra)}&pagina=1&tamanhoPagina=${PRICE_RESEARCH_PAGE_SIZE}`
}

/** Hora da consulta em Brasília, `AAAA-MM-DD HH:MM:SS`: o mesmo texto em qualquer máquina. */
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
}

/** Data pela qual a fonte ordena a resposta (decrescente) e pela qual a janela conta. */
const resultDateOf = (r: { dataResultado?: string | null }) => r.dataResultado?.slice(0, 10) ?? null

/**
 * Coleta as páginas de uma consulta, em lotes de `concurrency`. Com janela (`windowStartFor`
 * devolve o início dela a partir da hora da consulta), para quando a última linha lida passa do
 * início: a fonte ordena por data do resultado, decrescente, e o resto só é mais antigo. Antes de
 * parar, confere a ordem em cada página lida (de forma incremental) e lê a última página, onde
 * cairia linha sem data do resultado ou fora de ordem; qualquer quebra faz ler tudo, até o teto.
 * A última página lida como conferência é reaproveitada se a leitura completa chegar a ela.
 */
export async function collectSourcePages<T extends { dataResultado?: string | null }>(options: {
	fetchPage: (pagina: number) => Promise<SourcePage<T>>
	windowStartFor: ((consultedAt: string) => string) | null
	maxPages?: number
	concurrency?: number
	/** Pausa de cortesia entre lotes, em ms. */
	pauseMs?: number
	now?: () => Date
}): Promise<CollectedSource<T>> {
	const maxPages = options.maxPages ?? PRICE_RESEARCH_MAX_PAGES
	const concurrency = options.concurrency ?? 4
	const cache = new Map<number, Promise<SourcePage<T>>>()
	const fetchPage = (pagina: number) => {
		const cached = cache.get(pagina)
		if (cached) return cached
		const request = options.fetchPage(pagina)
		cache.set(pagina, request)
		return request
	}

	const first = await fetchPage(1)
	const consultedAt = first.fetchedAt ?? (options.now?.() ?? new Date()).toISOString()
	const cutoff = options.windowStartFor?.(consultedAt) ?? null
	const totalPages = first.totalPaginas
	const limit = Math.min(totalPages, maxPages)
	const pages: T[][] = []

	// Ordem conferida a cada página que entra: uma quebra vale para o resto da coleta.
	let ordered = true
	let lastDate: string | null = null
	const continuesOrder = (rows: readonly T[], from: string | null) => {
		let previous = from
		for (const r of rows) {
			const date = resultDateOf(r)
			if (!date || (previous && date > previous)) return { ok: false, last: previous }
			previous = date
		}
		return { ok: true, last: previous }
	}
	const take = (rows: T[]) => {
		pages.push(rows)
		if (!ordered) return
		const step = continuesOrder(rows, lastDate)
		ordered = step.ok
		lastDate = step.last
	}
	const passedWindowStart = () => cutoff != null && ordered && lastDate != null && lastDate < cutoff

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
	if (pages.length < totalPages && passedWindowStart()) {
		// A última página continua a ordem? Linha sem data ou mais nova que a última lida quebra a premissa.
		const last = await fetchPage(totalPages)
		if (continuesOrder(last.resultado, lastDate).ok) stoppedAtWindow = true
		else {
			stopAtWindow = false
			await readUpTo()
		}
	}

	const coverage: SourceCoverage = pages.length >= totalPages ? "complete" : stoppedAtWindow ? "window" : "truncated"
	return {
		results: pages.flat(),
		consultation: { consultedAt, totalRecords: first.totalRegistros, totalPages, pagesFetched: Math.min(pages.length, totalPages), coverage },
	}
}
