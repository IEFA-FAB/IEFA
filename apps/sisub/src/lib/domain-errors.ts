/**
 * @module domain-errors
 * Converte subclasses de DomainError em respostas HTTP para server functions do TanStack Start.
 *
 * IMPORTANTE — não lançar `Response` cru aqui. Numa server function do TanStack Start, um
 * `throw new Response(...)` volta ao client marcado com `x-tss-raw: true`, e o RPC client
 * RESOLVE a promise com o objeto `Response` em vez de rejeitar. O chamador (ex.: react-query)
 * recebe um `Response` no lugar dos dados — e qualquer `.map`/`.find`/acesso a campo quebra
 * a árvore inteira (bug do `kitchens.map is not a function` no PermissionsManager).
 *
 * Em vez disso: `setResponseStatus(code)` define o status HTTP e `throw new Error(...)` é
 * serializado pelo framework (`x-tss-serialized`) e RE-LANÇADO no client — react-query cai
 * em estado de erro e `data` permanece `undefined` (default do hook assume o controle).
 */

import { AssuranceRequiredError } from "@iefa/pbac"
import { DomainError, GENERIC_DB_ERROR_MESSAGE, NotFoundError, PermissionDeniedError, QueryFailedError } from "@iefa/sisub-domain/types"
import { setResponseStatus } from "@tanstack/react-start/server"

/**
 * Erro cru do driver que escapou sem virar `DomainError` (query feita fora do `runQuery`).
 * O `DrizzleQueryError` põe `Failed query: <SQL> params: <valores>` na mensagem, e o erro do
 * `postgres-js` traz o SQLSTATE em `.code` — nenhum dos dois é texto para o navegador.
 */
export function isDriverError(error: unknown): boolean {
	if (!(error instanceof Error)) return false
	if (error.name === "DrizzleQueryError" || error.name === "PostgresError") return true
	if (error.message.startsWith("Failed query:")) return true
	const code = (error as { code?: unknown }).code
	return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) && "severity" in error
}

/**
 * Mensagem que pode ir ao cliente para uma falha de banco — e o log do diagnóstico inteiro,
 * que é onde o SQL e os parâmetros têm de ficar.
 */
function toPublicDbError(error: Error, publicMessage: string): Error {
	// biome-ignore lint/suspicious/noConsole: server-side — é o único lugar onde o SQL da falha aparece
	console.error("[domain-error]", error.message, (error as { cause?: unknown }).cause ?? "")
	return new Error(publicMessage)
}

export function handleDomainError(error: unknown): never {
	// Garantia de identidade vem ANTES do ramo de permissão e é relançada INTEIRA: é o
	// `nextStep` que diz à UI qual das três telas abrir (cadastrar fator, digitar o código,
	// reelevar). Achatá-la num "Forbidden" de string transformaria "prove quem você é" em
	// "acesso negado" — numa operação que a pessoa PODE fazer, que é o pior desfecho possível
	// de um controle de segurança. 403 e não 401 de propósito: a sessão é válida, e um 401
	// faria o interceptador de sessão expirada deslogar quem só precisava de 6 dígitos.
	//
	// O erro NÃO estende `DomainError` (o pacote `@iefa/pbac` é agnóstico de app), então sem
	// este ramo ele cairia no `throw error` do final e viraria 500.
	if (error instanceof AssuranceRequiredError) {
		setResponseStatus(403)
		throw error
	}
	if (error instanceof PermissionDeniedError) {
		setResponseStatus(403)
		throw new Error(error.message || "Forbidden")
	}
	if (error instanceof NotFoundError) {
		setResponseStatus(404)
		throw new Error(error.message || "Not found")
	}
	// Falha de banco: a `message` é o diagnóstico (SQL, parâmetros, SQLSTATE) e fica no log;
	// o cliente lê `publicMessage`. Antes do ramo genérico, que devolveria o SQL com 400.
	if (error instanceof QueryFailedError) {
		setResponseStatus(400)
		throw toPublicDbError(error, error.publicMessage)
	}
	// Regra de negócio (validação, conflito, estado inválido): texto escrito para o usuário.
	if (error instanceof DomainError) {
		setResponseStatus(400)
		throw new Error(error.message)
	}
	if (isDriverError(error)) {
		setResponseStatus(500)
		throw toPublicDbError(error as Error, GENERIC_DB_ERROR_MESSAGE)
	}
	throw error
}
