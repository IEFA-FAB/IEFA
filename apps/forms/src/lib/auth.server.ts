/**
 * @module auth.server
 * Guards de autenticação das server functions do forms.
 *
 * O app já autorizava por questionário (criador/editor/viewer), mas cada fn repetia
 * `getUser()` + `throw new Error("Não autenticado")`. Isso custava um round-trip ao
 * GoTrue por chamada e devolvia 500 para o que é 401/403 — o cliente não conseguia
 * distinguir "sessão expirou" de "servidor quebrou".
 *
 * O cache request-scoped e a sinalização de status vêm de `@iefa/pbac/start`,
 * compartilhados com sisub, portal, rumaer e sucont. A autorização segue própria:
 * o forms decide por papel no questionário, não por grant PBAC.
 */

import { createRequestAuth, forbidden as denyWithStatus, unauthorized as unauthenticatedWithStatus } from "@iefa/pbac/start"
import { getIefaAuthClient } from "./supabase.server"

/** Sinaliza 401 antes de lançar — senão o framework devolve 500. */
export function unauthorized(): never {
	return unauthenticatedWithStatus("Não autenticado")
}

/** Sinaliza 403 — autenticado, sem acesso ao recurso. */
export function forbidden(message = "Sem permissão"): never {
	return denyWithStatus(message)
}

const auth = createRequestAuth({ getAuthClient: getIefaAuthClient, messages: { unauthorized: "Não autenticado" } })

export const { getRequestUser } = auth

/** Usuário autenticado do request. @throws 401 */
export async function requireUser() {
	const user = await auth.getRequestUser()
	if (!user) unauthorized()
	return user
}

/** Id do usuário autenticado. @throws 401 */
export async function requireUserId(): Promise<string> {
	return (await requireUser()).id
}
