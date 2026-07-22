/**
 * @module auth.fn
 * Server-side session validation via Supabase Auth.
 * CLIENT: getSupabaseAuthClient (JWT validation — NOT service role). Validates token with Supabase Auth server, not localStorage.
 * @domain external
 * @migration n-a
 */

import { createServerFn } from "@tanstack/react-start"
import { getRequestUser } from "@/lib/auth.server"
import { getSupabaseAuthClient } from "@/lib/supabase.server"

/**
 * Validates the current request's JWT and returns the authenticated user and session, or null for each if unauthenticated.
 *
 * @remarks
 * Uses getSupabaseAuthClient — auth.getUser() performs a server-side token check.
 * Does NOT throw on unauthenticated requests — returns { user: null, session: null } instead.
 */
// Público por contrato: valida o JWT do request e devolve { user: null } quando não há
// sessão. Guard aqui seria circular. Ver PUBLIC_SERVER_FNS em server-fn-auth.contract.test.ts.
// nosemgrep: server-fn-missing-auth-guard
export const getServerSessionFn = createServerFn({ method: "GET" }).handler(async () => {
	const supabase = getSupabaseAuthClient()
	// getUser() valida o token no servidor Supabase — não usa localStorage.
	// getSession() é independente de getUser() → roda em paralelo.
	// getRequestUser() cacheia o getUser() por request: o resultado é reusado pelos
	// requireUserId/requireAuth das server fns filhas no mesmo SSR (sem 2º round-trip).
	const [
		user,
		{
			data: { session },
		},
	] = await Promise.all([getRequestUser(), supabase.auth.getSession()])

	return {
		user,
		session: session ?? null,
	}
})
