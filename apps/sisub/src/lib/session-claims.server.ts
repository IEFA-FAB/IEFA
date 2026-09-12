/**
 * @module session-claims.server
 * Claims da sessão da request (id da sessão e origem), lidas do access token JÁ VALIDADO.
 *
 * ## A ordem é o contrato
 *
 * `requireUser()` valida o JWT contra o GoTrue e é cacheado por request. Só DEPOIS dele o
 * token de `getSession()` pode ser decodificado localmente — é o mesmo raciocínio (e a mesma
 * conferência de `sub`) de `createRequestAuth` em `@iefa/pbac/start`. Por isso a validação
 * acontece DENTRO desta função, e não por convenção do chamador: não existe forma de chamar
 * isto sem ter validado o token antes.
 *
 * @domain app
 */

import { decodeJwtPayload, readSubject } from "@iefa/pbac"
import { setResponseStatus } from "@tanstack/react-start/server"
import { requireUser } from "@/lib/auth.server"
import { isRecoveryOriginatedSession, readSessionId } from "@/lib/session-claims"
import { getSupabaseAuthClient } from "@/lib/supabase.server"

export type SessionClaims = {
	/** `session_id` do token, ou `null` quando o token não o traz. */
	sessionId: string | null
	/** `true` quando a sessão nasceu de um link de recuperação de senha. */
	originatedFromRecovery: boolean
}

const NO_CLAIMS: SessionClaims = { sessionId: null, originatedFromRecovery: false }

/**
 * Claims da sessão desta request.
 *
 * Todo caminho de falha devolve `NO_CLAIMS` em vez de lançar: indisponibilidade de leitura de
 * claim não pode derrubar um request que a autenticação já aprovou.
 */
export async function getSessionClaims(): Promise<SessionClaims> {
	const user = await requireUser()
	const { data } = await getSupabaseAuthClient()
		.auth.getSession()
		.catch(() => ({ data: { session: null } }))

	const payload = decodeJwtPayload(data.session?.access_token)
	// `sub` diferente = o cookie mudou entre as duas leituras (troca de conta numa aba
	// paralela). Ler a origem de OUTRA sessão decidiria o bloqueio pela sessão errada.
	if (readSubject(payload) !== user.id) return { ...NO_CLAIMS }

	return { sessionId: readSessionId(payload), originatedFromRecovery: isRecoveryOriginatedSession(payload) }
}

/**
 * Barra a gestão de fatores a partir de uma sessão de recuperação de senha
 * (spec `mfa-enrollment`).
 *
 * 403 e não 401: a sessão é válida, e um 401 faria o interceptador de sessão expirada
 * deslogar quem precisa apenas entrar de novo com a senha.
 *
 * @throws {Error} "RECOVERY_SESSION_CANNOT_MANAGE_FACTORS" (403)
 */
export async function requireNonRecoverySession(): Promise<SessionClaims> {
	const claims = await getSessionClaims()
	if (claims.originatedFromRecovery) {
		setResponseStatus(403)
		throw new Error("Esta sessão foi aberta por um link de recuperação de senha. Entre novamente com sua senha para gerenciar a verificação em duas etapas.")
	}
	return claims
}
