import createClient from "openapi-fetch"
import type { paths } from "./types.gen.ts"

export const COMPRAS_BASE_URL = "https://dadosabertos.compras.gov.br"

/**
 * `tamanhoPagina` fora desta faixa devolve 400 com corpo em `text/plain`
 * ("Informe um número de paginação no intervalo de 10 a 500") — não é
 * documentado no swagger, então não há tipo que o impeça.
 */
export const COMPRAS_MIN_PAGE_SIZE = 10
export const COMPRAS_MAX_PAGE_SIZE = 500

/**
 * Janela máxima aceita pelos filtros de data do módulo ARP. Acima disso a API
 * responde 400 "Período inicial e final maior que 365 dias." — 365 exatos passam.
 */
export const COMPRAS_MAX_DATE_WINDOW_DAYS = 365

export type ComprasClient = ReturnType<typeof createComprasClient>

/**
 * Cria um client tipado do Compras.gov.br a partir do swagger oficial
 * (`/v3/api-docs`, espelhado em `openapi.json`).
 *
 * @param fetchImpl - Implementação de fetch. É o ponto de extensão para retry,
 *   timeout e backoff: cada consumidor traz a sua política em vez de o package
 *   impor uma. Sem isso, `apps/api` perderia o pool de work-stealing e o
 *   tratamento de `Retry-After` que já tem.
 */
export function createComprasClient(fetchImpl?: typeof fetch) {
	return createClient<paths>({
		baseUrl: COMPRAS_BASE_URL,
		headers: { accept: "application/json" },
		...(fetchImpl ? { fetch: fetchImpl } : {}),
	})
}

/** Client sem retry — só para chamada avulsa em que o chamador trata a falha. */
export const comprasClient = createComprasClient()

export type { paths }
