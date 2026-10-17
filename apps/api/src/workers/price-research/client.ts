import { COMPRAS_BASE_URL, type ComprasQuery } from "@iefa/compras-api"
import { collectSourcePages, PRICE_RESEARCH_PAGE_SIZE, type PriceResearchSourceConsultation } from "@iefa/sisub-domain"
import type { ComprasMaterialPrecoItem, ComprasMaterialPrecoPage } from "./types.ts"

const BASE_URL = COMPRAS_BASE_URL
const ENDPOINT = "/modulo-pesquisa-preco/1_consultarMaterial" as const
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

export interface ConsultaPrecoParams {
	/** Janela em meses: a coleta para quando a fonte passa do início dela. Ausente = todo o histórico. */
	months?: number
	estado?: string
	codigoUasg?: string
	codigoMunicipio?: number
}

/**
 * Parâmetros da consulta, sem `pagina`: é o que a pesquisa grava em `source_query` para o relatório
 * montar a URL de repetição.
 */
function buildQuery(catmatCode: number, params: ConsultaPrecoParams): URLSearchParams {
	// Conferido contra o swagger: `tipo` e `codigo` são obrigatórios, e o antigo
	// `codigoItemCatalogo=<n>` responde 404 (Resource not found).
	const query: Omit<ComprasQuery<typeof ENDPOINT>, "pagina"> = {
		tipo: "codigoItemCatalogo",
		codigo: String(catmatCode),
		tamanhoPagina: PRICE_RESEARCH_PAGE_SIZE,
		dataResultado: true, // apenas compras com resultado homologado
		...(params.estado ? { estado: params.estado } : {}),
		...(params.codigoUasg ? { codigoUasg: params.codigoUasg } : {}),
		...(params.codigoMunicipio ? { codigoMunicipio: params.codigoMunicipio } : {}),
	}
	return new URLSearchParams(Object.entries(query).map(([k, v]): [string, string] => [k, String(v)]))
}

// ─── Fetch de uma página com retry exponencial ───────────────────────────────

async function fetchPaginaMaterial(catmatCode: number, params: ConsultaPrecoParams, page: number, deadline: number): Promise<ComprasMaterialPrecoPage> {
	const qs = buildQuery(catmatCode, params)
	qs.set("pagina", String(page))
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

// ─── Coleta das páginas ───────────────────────────────────────────────────────

export interface MaterialPriceQueryResult {
	items: ComprasMaterialPrecoItem[]
	/** Hora (deste servidor, ao receber a página 1), parâmetros, totais da fonte, páginas lidas e cobertura. */
	source: PriceResearchSourceConsultation
}

/**
 * Consulta o módulo de pesquisa de preço da API Compras.gov.br para um item CATMAT pela mesma
 * regra do sisub (`collectSourcePages`): com janela, para quando a fonte (ordenada por data do
 * resultado, decrescente) passa do início dela, conferida a última página; sem janela, lê tudo até
 * o teto. Lotes de 4 páginas, com 250 ms de cortesia entre eles. O corte no teto volta como
 * `coverage: "truncated"`, e quem chama não usa a amostra.
 */
export async function consultarMaterialPrecos(
	catmatCode: number,
	params: ConsultaPrecoParams = {},
	budgetMs: number = QUERY_BUDGET_MS
): Promise<MaterialPriceQueryResult> {
	const deadline = Date.now() + budgetMs
	const { results, consultation } = await collectSourcePages<ComprasMaterialPrecoItem>({
		fetchPage: async (pagina) => ({ ...(await fetchPaginaMaterial(catmatCode, params, pagina, deadline)), fetchedAt: new Date().toISOString() }),
		query: buildQuery(catmatCode, params).toString(),
		periodMonths: params.months ?? null,
		concurrency: 4,
		pauseMs: 250,
	})
	return { items: results, source: consultation }
}
