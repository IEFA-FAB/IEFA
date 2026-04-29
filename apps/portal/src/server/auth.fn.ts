/**
 * @module auth.fn
 * Server-side session validation via Supabase Auth.
 * CLIENT: getIefaAuthClient (JWT validation — NOT service role). Validates token with Supabase Auth server, not localStorage.
 */

import { createServerFn } from "@tanstack/react-start"
import { getIefaAuthClient } from "@/lib/supabase.server"

/**
 * Validates the current request's JWT and returns the authenticated user and session, or null for each if unauthenticated.
 *
 * @remarks
 * Uses getIefaAuthClient — auth.getUser() performs a server-side token check via cookies.
 * Does NOT throw on unauthenticated requests — returns { user: null, session: null } instead.
 */
export const getServerSessionFn = createServerFn({ method: "GET" }).handler(async () => {
	const supabase = getIefaAuthClient()
	// getUser() valida o token no servidor Supabase — não usa localStorage
	const {
		data: { user },
	} = await supabase.auth.getUser()
	const {
		data: { session },
	} = await supabase.auth.getSession()

	return {
		user: user ?? null,
		session: session ?? null,
	}
})
