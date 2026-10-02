/**
 * @module auth.fn
 * Server-side session validation via Supabase Auth.
 * CLIENT: getRequestUser (JWT validation — NOT service role). Validates token with Supabase Auth server, not localStorage.
 * @domain external
 * @migration n-a
 */

import { createServerFn } from "@tanstack/react-start"
import { getRequestUser } from "@/lib/auth.server"

/**
 * Valida o JWT do request e devolve o usuário autenticado, ou `{ user: null }` sem sessão.
 *
 * Só o usuário, nunca a sessão: o retorno desta fn é serializado no HTML do SSR (estado
 * desidratado do React Query), e a sessão carrega access e refresh token.
 */
// Público por contrato: valida o JWT do request e devolve { user: null } quando não há
// sessão. Guard aqui seria circular. Ver PUBLIC_SERVER_FNS em server-fn-auth.contract.test.ts.
// nosemgrep: server-fn-missing-auth-guard
export const getServerSessionFn = createServerFn({ method: "GET" }).handler(async () => {
	// getUser() valida o token no servidor Supabase — não usa localStorage.
	// getRequestUser() cacheia o getUser() por request: o resultado é reusado pelos
	// requireUserId/requireAuth das server fns filhas no mesmo SSR (sem 2º round-trip).
	return { user: await getRequestUser() }
})
