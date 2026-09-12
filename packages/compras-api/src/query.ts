import type { paths } from "./types.gen.ts"

/**
 * Tipos auxiliares para quem NÃO usa o `comprasClient` em runtime.
 *
 * `apps/api` tem uma camada própria de paginação (pool de work-stealing,
 * backoff com jitter, leitura de `Retry-After`) que percorre um endpoint
 * genérico por string. Trocar isso pelo openapi-fetch custaria a camada
 * inteira; estes tipos dão a mesma garantia de compilação — nome de endpoint
 * e nome de parâmetro conferidos contra o swagger — sem tocar no runtime.
 */

/** Endpoints do Compras.gov.br que expõem GET. */
export type ComprasGetPath = {
	[P in keyof paths]: paths[P] extends { get: { parameters: { query?: unknown } } } ? P : never
}[keyof paths]

/** Query string aceita por um endpoint, exatamente como o swagger declara. */
export type ComprasQuery<P extends ComprasGetPath> = NonNullable<paths[P]["get"]["parameters"]["query"]>

/**
 * Query sem os campos de paginação, que o paginador preenche sozinho.
 * Preserva a obrigatoriedade dos demais: faltar `tipo`/`codigo` em
 * `1_consultarMaterial` vira erro de compilação, não 404 em produção.
 */
export type ComprasPageQuery<P extends ComprasGetPath> = Omit<ComprasQuery<P>, "pagina" | "tamanhoPagina">
