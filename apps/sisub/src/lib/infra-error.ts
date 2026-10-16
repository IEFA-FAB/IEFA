/**
 * @module infra-error
 * A falha foi da infraestrutura (conexão com o banco, pooler sem vaga, prazo do pool,
 * servidor reiniciando, rede), e não do que o usuário pediu?
 *
 * `handleDomainError` usa isto para responder 503 em vez de 400: com 400, queda do pooler e
 * prazo estourado sumiam do monitoramento de 5xx do ALB, misturados a erro de dado.
 *
 * O código mora no erro do driver: o `code` do `QueryFailedError` é o do domínio (ex.:
 * `FETCH_FAILED`), e o do driver fica no `cause` dele; o `unwrapPgError` desce dali.
 *
 * Os códigos de conexão vêm do `isTransientConnectionError` do `@iefa/sisub-domain` (o que
 * decide a retentativa única), para as duas listas não divergirem. Aqui entram também os
 * casos que não se repetem mas continuam sendo infraestrutura: o prazo do pool, o pooler sem
 * vaga e a falha de rede/DNS.
 *
 * Fora, de propósito: `57014` (`statement_timeout`). Quase sempre é a própria consulta pesada
 * (filtro amplo), não queda: responder "indisponível" faria a pessoa repetir o mesmo pedido e
 * somaria 5xx sem incidente. Ele tem mensagem própria ({@link isStatementTimeout}).
 *
 * Erro do PostgREST (supabase-js) não passa por aqui: o cliente devolve `{ error }` em vez de
 * lançar, inclusive no timeout do `createTimeoutFetch` (`code: ""`), e as fns o relançam como
 * `Error` simples com o texto de `publicDbMessage` ("o banco não respondeu; tente de novo"),
 * sem código na cadeia. Esse caminho não muda aqui.
 */

import { QUERY_DEADLINE_CODE } from "@iefa/database/postgres-pool"
import { DomainError, QueryFailedError } from "@iefa/sisub-domain/types"
import { isTransientConnectionError, unwrapPgError } from "@iefa/sisub-domain/utils"

/**
 * Infraestrutura além da queda de conexão que o `isTransientConnectionError` já cobre
 * (`CONNECT_TIMEOUT`, `CONNECTION_CLOSED|ENDED|DESTROYED`, `ECONNRESET`, `ECONNREFUSED`,
 * `EPIPE`, `ETIMEDOUT`, `57P01`–`57P03`, classe `08`):
 *
 * - `QUERY_DEADLINE`: prazo de execução do `postgres-pool.ts`, que derruba o pool travado.
 * - Rede e DNS até o pooler: `ENOTFOUND`, `EAI_AGAIN`, `EHOSTUNREACH`, `ENETUNREACH`,
 *   `ECONNABORTED`. Sem eles, o erro cru (`getaddrinfo ENOTFOUND <host do pooler>`) caía no
 *   `throw error` final do `handleDomainError` e levava o host ao navegador.
 * - `53300` (too_many_connections): o que o Postgres responde direto; pelo Supavisor ele só
 *   chega repassado da conexão do pooler com o banco. O pooler cheio tem código próprio,
 *   ver {@link SUPAVISOR_FAILURE}.
 */
const EXTRA_INFRASTRUCTURE_CODES: ReadonlySet<string> = new Set([
	QUERY_DEADLINE_CODE,
	"ENOTFOUND",
	"EAI_AGAIN",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"ECONNABORTED",
	"53300",
])

/**
 * Falha do próprio pooler. O Supavisor responde `FATAL` com SQLSTATE genérico `XX000` e o
 * código dele entre parênteses no início da mensagem: `(EMAXCONN) max client connections
 * reached, limit: N`, `(ECHECKOUTTIMEOUT) unable to check out connection from the pool…`,
 * `(EPROXYSUPERVISORUNAVAILABLE) …`. Fonte: `supabase/supavisor`, `lib/supavisor/error.ex`
 * (o `postgres_error` padrão é `%{"S" => "FATAL", "C" => "XX000", "M" => "(<code>) <mensagem>"}`)
 * e `lib/supavisor/errors/*_error.ex`, commit 5df5caf (2026-10-08). Nos logs do projeto (24 h,
 * `supavisor_logs`) não houve episódio para conferir.
 *
 * Qualquer prefixo `(E…)`, e não uma lista: o cliente do Supavisor é o nosso servidor, então
 * toda recusa dele é do lado do servidor, e o Postgres não escreve `internal_error` nesse
 * formato. Os erros de configuração (senha, tenant) usam outro SQLSTATE (`28P01`, `08P01`) ou
 * também são indisponibilidade do ponto de vista de quem usa a tela.
 *
 * `XX000` sem o prefixo é o `internal_error` do Postgres e não entra.
 */
const SUPAVISOR_FAILURE = /^\(E[A-Z]+\) /

/** O erro do driver por trás do erro recebido; `undefined` quando é regra de negócio. */
function driverErrorOf(error: unknown): unknown {
	// O `code` do QueryFailedError é do domínio; o do driver está no `cause`.
	if (error instanceof QueryFailedError) return error.cause
	if (error instanceof DomainError) return undefined
	return error
}

export function isInfrastructureError(error: unknown): boolean {
	const driver = driverErrorOf(error)
	if (driver === undefined || driver === null) return false
	if (isTransientConnectionError(driver)) return true
	const { code, message } = unwrapPgError(driver)
	if (!code) return false
	return EXTRA_INFRASTRUCTURE_CODES.has(code) || (code === "XX000" && SUPAVISOR_FAILURE.test(message ?? ""))
}

/** `57014`: o `statement_timeout` cancelou a consulta (ou alguém a cancelou no banco). */
export function isStatementTimeout(error: unknown): boolean {
	const driver = driverErrorOf(error)
	if (driver === undefined || driver === null) return false
	return unwrapPgError(driver).code === "57014"
}
