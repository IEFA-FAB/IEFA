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
