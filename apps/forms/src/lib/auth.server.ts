/**
 * @module auth.server
 * Guards de autenticação das server functions do forms.
 *
 * O app já autorizava por questionário (criador/editor/viewer), mas cada fn repetia
 * `getUser()` + `throw new Error("Não autenticado")`. Isso custava um round-trip ao
 * GoTrue por chamada e devolvia 500 para o que é 401/403 — o cliente não conseguia
 * distinguir "sessão expirou" de "servidor quebrou".
 *
 * Mesmo padrão do sisub, portal e rumaer.
 */

import type { User } from "@supabase/supabase-js"
import { getRequest, setResponseStatus } from "@tanstack/react-start/server"
import { getIefaAuthClient } from "./supabase.server"

/** Sinaliza 401 antes de lançar — senão o framework devolve 500. */
export function unauthorized(): never {
	setResponseStatus(401)
	throw new Error("Não autenticado")
}

/** Sinaliza 403 — autenticado, sem acesso ao recurso. */
export function forbidden(message = "Sem permissão"): never {
	setResponseStatus(403)
	throw new Error(message)
}

/**
 * Cache request-scoped do `auth.getUser()`: ele valida o JWT no servidor Supabase
 * (round-trip de rede) e o mesmo request chama várias fns. Chaveado pelo `Request`;
 * o WeakMap libera quando o request é coletado. Cacheia a Promise para coalescer
 * chamadas concorrentes num round-trip só.
 */
const userByRequest = new WeakMap<Request, Promise<User | null>>()

export function getRequestUser(): Promise<User | null> {
	const resolve = () =>
		getIefaAuthClient()
			.auth.getUser()
			.then(({ data }) => data.user ?? null)

	const request = getRequest()
	if (!request) return resolve()

	let cached = userByRequest.get(request)
	if (!cached) {
		cached = resolve()
		userByRequest.set(request, cached)
	}
	return cached
}

/** Usuário autenticado do request. @throws 401 */
export async function requireUser(): Promise<User> {
	const user = await getRequestUser()
	if (!user) unauthorized()
	return user
}

/** Id do usuário autenticado. @throws 401 */
export async function requireUserId(): Promise<string> {
	return (await requireUser()).id
}
