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

import { DomainError, NotFoundError, PermissionDeniedError } from "@iefa/sisub-domain/types"
import { setResponseStatus } from "@tanstack/react-start/server"

export function handleDomainError(error: unknown): never {
	if (error instanceof PermissionDeniedError) {
		setResponseStatus(403)
		throw new Error(error.message || "Forbidden")
	}
	if (error instanceof NotFoundError) {
		setResponseStatus(404)
		throw new Error(error.message || "Not found")
	}
	if (error instanceof DomainError) {
		setResponseStatus(400)
		throw new Error(error.message)
	}
	throw error
}
