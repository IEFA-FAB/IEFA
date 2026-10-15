import { COMPRAS_BASE_URL, type ComprasQuery } from "@iefa/compras-api"
import type { ComprasMaterialPrecoItem, ComprasMaterialPrecoPage } from "./types.ts"

const BASE_URL = COMPRAS_BASE_URL
const ENDPOINT = "/modulo-pesquisa-preco/1_consultarMaterial" as const
const PAGE_SIZE = 500
const TIMEOUT_MS = 30_000
/**
 * Tentativas por página: 3 chamadas, com esperas de 1 s e 3 s entre elas.
 *
 * Diferente de `workers/compras-sync/client.ts` de propósito, e um não deve ser "alinhado"
 * pelo outro sem saber: aqui quem espera é um request HTTP (`api/routes/price-research.ts`)
 * atrás do ALB, então o backoff é curto, sem `Retry-After`, e tudo cabe em
 * `QUERY_BUDGET_MS`; o sync é job em segundo plano e pode esperar até 60 s por tentativa.
 * Aqui também toda resposta não-2xx é retentada (400 e 404 inclusive), enquanto o sync
 * retenta só a lista dele, que inclui 400 porque o ComprasGov devolve 400 sob sobrecarga.
 */
const MAX_ATTEMPTS = 3
/**
 * Prazo de uma consulta inteira (todas as páginas, tentativas e esperas), abaixo dos 60 s
 * de `idle_timeout` do ALB (`infra/foundation/alb.tf`). Sem ele, três tentativas que
 * estouram o `TIMEOUT_MS` levavam 30 + 1 + 30 + 3 + 30 = 94 s numa página só, e o ALB
 * cortava o request antes do erro chegar a quem pediu. Cada tentativa recebe o menor entre
 * `TIMEOUT_MS` e o que sobra, e não começa tentativa nova sem `MIN_ATTEMPT_MS` de folga.
 *
 * O prazo é por CATMAT: a pesquisa de um anexo inteiro consulta vários em sequência
 * (lotes de 3) e, com anexo grande, ainda pode passar do idle.
 */
export const QUERY_BUDGET_MS = 50_000
const MIN_ATTEMPT_MS = 1_000
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

async function fetchPaginaMaterial(catmatCode: number, params: ConsultaPrecoParams, page: number, deadline: number): Promise<ComprasMaterialPrecoPage> {
	// Conferido contra o swagger: `tipo` e `codigo` são obrigatórios, e o antigo
	// `codigoItemCatalogo=<n>` responde 404 (Resource not found).
	const query: ComprasQuery<typeof ENDPOINT> = {
		tipo: "codigoItemCatalogo",
		codigo: String(catmatCode),
		pagina: page,
		tamanhoPagina: PAGE_SIZE,
		dataResultado: true, // apenas compras com resultado homologado
		...(params.estado ? { estado: params.estado } : {}),
		...(params.codigoUasg ? { codigoUasg: params.codigoUasg } : {}),
		...(params.codigoMunicipio ? { codigoMunicipio: params.codigoMunicipio } : {}),
	}

	const qs = new URLSearchParams(Object.entries(query).map(([k, v]): [string, string] => [k, String(v)]))
	const url = `${BASE_URL}${ENDPOINT}?${qs}`

	let lastErr: unknown = new Error(`Prazo de ${QUERY_BUDGET_MS / 1000} s da consulta à API Compras esgotado`)
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		// Backoff 2^attempt − 1: 1 s antes da 2ª tentativa e 3 s antes da 3ª.
		const backoffMs = attempt > 0 ? (2 ** attempt - 1) * 1_000 : 0
		if (Date.now() + backoffMs + MIN_ATTEMPT_MS > deadline) break
		if (backoffMs > 0) await new Promise((r) => setTimeout(r, backoffMs))
		try {
			const res = await fetch(url, {
				signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, deadline - Date.now())),
				headers: { accept: "*/*" },
			})
			if (!res.ok) {
				throw new Error(`HTTP ${res.status} ao consultar API Compras`)
			}
			// `idCompra` vem como inteiro de 17 dígitos, acima de Number.MAX_SAFE_INTEGER:
			// JSON.parse corromperia os últimos dígitos e ele é chave do dedup de amostras.
			// Promove o literal a string antes do parse (idempotente se já vier com aspas).
			const raw = await res.text()
			return JSON.parse(raw.replace(/"idCompra"\s*:\s*(-?\d+)/g, '"idCompra":"$1"')) as ComprasMaterialPrecoPage
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
export async function consultarMaterialPrecos(
	catmatCode: number,
	params: ConsultaPrecoParams = {},
	budgetMs: number = QUERY_BUDGET_MS
): Promise<ComprasMaterialPrecoItem[]> {
	const deadline = Date.now() + budgetMs
	const firstPage = await fetchPaginaMaterial(catmatCode, params, 1, deadline)
	const items: ComprasMaterialPrecoItem[] = [...firstPage.resultado]

	const totalPages = Math.min(firstPage.totalPaginas, MAX_PAGES)
	if (totalPages <= 1) return items

	// Buscar páginas restantes em lotes de 4 (cortesia à API pública)
	const CONCURRENCY = 4
	for (let batchStart = 2; batchStart <= totalPages; batchStart += CONCURRENCY) {
		const batchEnd = Math.min(batchStart + CONCURRENCY - 1, totalPages)
		const pageNums = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i)

		const pages = await Promise.all(pageNums.map((p) => fetchPaginaMaterial(catmatCode, params, p, deadline)))
		for (const page of pages) items.push(...page.resultado)

		// Intervalo de cortesia entre lotes
		if (batchEnd < totalPages) {
			await new Promise((r) => setTimeout(r, 250))
		}
	}

	return items
}
