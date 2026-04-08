import type { ComprasMaterialPrecoItem, ComprasMaterialPrecoPage } from "./types.ts"

const BASE_URL = "https://dadosabertos.compras.gov.br"
const PAGE_SIZE = 500
const TIMEOUT_MS = 30_000
const MAX_RETRIES = 3
/**
 * Cap de páginas buscadas por item CATMAT.
 * 20 páginas × 500 = 10.000 registros — suficiente para qualquer análise
 * estatística e evita hammering na API pública.
 */
const MAX_PAGES = 20

export interface ConsultaPrecoParams {
	estado?: string
	codigoUasg?: string
	codigoMunicipio?: number
}

// ─── Fetch de uma página com retry exponencial ───────────────────────────────

async function fetchPaginaMaterial(catmatCode: number, params: ConsultaPrecoParams, page: number): Promise<ComprasMaterialPrecoPage> {
	const qs = new URLSearchParams({
		codigoItemCatalogo: String(catmatCode),
		pagina: String(page),
		tamanhoPagina: String(PAGE_SIZE),
		dataResultado: "1", // apenas compras com resultado homologado
	})
	if (params.estado) qs.set("estado", params.estado)
	if (params.codigoUasg) qs.set("codigoUasg", params.codigoUasg)
	if (params.codigoMunicipio) qs.set("codigoMunicipio", String(params.codigoMunicipio))

	const url = `${BASE_URL}/modulo-pesquisa-preco/1_consultarMaterial?${qs}`

	let lastErr: unknown
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			if (attempt > 0) {
				// Backoff: 1s, 3s, 7s
				await new Promise((r) => setTimeout(r, (2 ** attempt - 1) * 1_000))
			}
			const res = await fetch(url, {
				signal: AbortSignal.timeout(TIMEOUT_MS),
				headers: { accept: "*/*" },
			})
			if (!res.ok) {
				throw new Error(`HTTP ${res.status} ao consultar API Compras`)
			}
			return (await res.json()) as ComprasMaterialPrecoPage
		} catch (err) {
			lastErr = err
		}
	}
	throw lastErr
}

// ─── Fetch de todas as páginas com concorrência controlada ───────────────────

/**
 * Consulta o módulo de pesquisa de preço da API Compras.gov.br para
 * um item CATMAT e retorna TODOS os registros disponíveis (até MAX_PAGES).
 *
 * Busca as páginas restantes com concorrência de 4 workers e um intervalo
 * de cortesia de 250ms entre lotes para não sobrecarregar a API pública.
 */
export async function consultarMaterialPrecos(catmatCode: number, params: ConsultaPrecoParams = {}): Promise<ComprasMaterialPrecoItem[]> {
	const firstPage = await fetchPaginaMaterial(catmatCode, params, 1)
	const items: ComprasMaterialPrecoItem[] = [...firstPage.resultado]

	const totalPages = Math.min(firstPage.totalPaginas, MAX_PAGES)
	if (totalPages <= 1) return items

	// Buscar páginas restantes em lotes de 4 (cortesia à API pública)
	const CONCURRENCY = 4
	for (let batchStart = 2; batchStart <= totalPages; batchStart += CONCURRENCY) {
		const batchEnd = Math.min(batchStart + CONCURRENCY - 1, totalPages)
		const pageNums = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i)

		const pages = await Promise.all(pageNums.map((p) => fetchPaginaMaterial(catmatCode, params, p)))
		for (const page of pages) items.push(...page.resultado)

		// Intervalo de cortesia entre lotes
		if (batchEnd < totalPages) {
			await new Promise((r) => setTimeout(r, 250))
		}
	}

	return items
}
