/**
 * @module infra-error
 * A falha foi da infraestrutura (conexão com o banco, prazo estourado, servidor reiniciando),
 * e não do que o usuário pediu?
 *
 * `handleDomainError` usa isto para responder 503 em vez de 400: com 400, queda do pooler e
 * timeout sumiam do monitoramento de 5xx do ALB, misturados a erro de dado e de validação.
 *
 * O código mora no erro do driver, não no `QueryFailedError` (cujo `code` é o do domínio, ex.:
 * `FETCH_FAILED`) nem no `DrizzleQueryError` (que não tem `code`): a cadeia de `cause` é
 * percorrida, pulando o `code` de qualquer `DomainError` no caminho.
 *
 * Diferença para o `isTransientConnectionError` do `@iefa/sisub-domain` (PR #633): aquele
 * decide se dá para REPETIR a query, e por isso deixa de fora `57014` e `QUERY_DEADLINE` (a
 * query rodou e foi lenta; repetir dobra a carga ou estoura os 60 s do ALB). Aqui a pergunta é
 * de quem é a culpa, e as duas são da infraestrutura. Quando o #633 entrar, este predicado
 * pode virar `isTransientConnectionError(e) || <prazo>`.
 *
 * Erro do PostgREST (supabase-js) não passa por aqui: o cliente devolve `{ error }` em vez de
 * lançar, inclusive no timeout do `createTimeoutFetch` (`code: ""`), e as fns o relançam como
 * `Error` simples com o texto de `publicDbMessage` ("o banco não respondeu; tente de novo"),
 * sem código na cadeia. Esse caminho não muda aqui.
 */

import { QUERY_DEADLINE_CODE } from "@iefa/database/postgres-pool"
import { DomainError } from "@iefa/sisub-domain/types"

/**
 * Códigos exatos de falha de infraestrutura.
 *
 * - postgres-js: `CONNECT_TIMEOUT` (o `connect_timeout` do `db.server.ts`). Os `CONNECTION_*`
 *   (`CLOSED`, `ENDED`, `DESTROYED`) entram pelo prefixo em {@link isInfrastructureCode}.
 * - Socket: queda no caminho até o pooler.
 * - SQLSTATE: `57P01`–`57P03` (admin shutdown, crash shutdown, cannot connect now), `57014`
 *   (`statement_timeout`), `53300` (too many connections: o pooler sem vaga).
 * - `QUERY_DEADLINE`: o prazo de execução do `postgres-pool.ts`, que derruba o pool travado.
 *
 * A classe `08` (connection exception) entra pelo prefixo.
 */
const INFRASTRUCTURE_CODES: ReadonlySet<string> = new Set([
	"CONNECT_TIMEOUT",
	"ECONNRESET",
	"ECONNREFUSED",
	"EPIPE",
	"ETIMEDOUT",
	"57P01",
	"57P02",
	"57P03",
	"57014",
	"53300",
	QUERY_DEADLINE_CODE,
])

/** SQLSTATE tem 5 caracteres; o prefixo `08` sozinho pegaria código de outra origem. */
const CONNECTION_EXCEPTION_SQLSTATE = /^08[0-9A-Z]{3}$/

export function isInfrastructureCode(code: string): boolean {
	return INFRASTRUCTURE_CODES.has(code) || code.startsWith("CONNECTION_") || CONNECTION_EXCEPTION_SQLSTATE.test(code)
}

/** Teto da cadeia de `cause`: cadeia circular não pode travar o tratamento de erro. */
const MAX_CAUSE_DEPTH = 10

/** Algum erro da cadeia de `cause` (fora os `DomainError`) traz código de infraestrutura? */
export function isInfrastructureError(error: unknown): boolean {
	let current: unknown = error
	for (let depth = 0; current !== null && typeof current === "object" && depth < MAX_CAUSE_DEPTH; depth++) {
		const code = (current as { code?: unknown }).code
		if (!(current instanceof DomainError) && typeof code === "string" && isInfrastructureCode(code)) return true
		current = (current as { cause?: unknown }).cause
	}
	return false
}
