/**
 * @module auth.fn
 * Server-side session validation via Supabase Auth.
 * CLIENT: getIefaAuthClient (JWT validation — NOT service role). Validates token with Supabase Auth server, not localStorage.
 */

import { createServerFn } from "@tanstack/react-start"
import { getIefaAuthClient } from "@/lib/supabase.server"

/**
 * Valida o JWT do request e devolve o usuário autenticado, ou `{ user: null }` sem sessão.
 *
 * Só o usuário, nunca a sessão: o retorno desta fn é serializado no HTML do SSR (estado
 * desidratado do React Query), e a sessão carrega access e refresh token. Quem precisa do
 * token (chamada ao α com Bearer) lê do client do navegador na hora da chamada.
 */
// Público por contrato: valida o JWT do request e devolve { user: null } sem sessão.
// nosemgrep: server-fn-missing-auth-guard
export const getServerSessionFn = createServerFn({ method: "GET" }).handler(async () => {
	// getUser() valida o token no servidor Supabase — não usa localStorage
	const {
		data: { user },
	} = await getIefaAuthClient().auth.getUser()
	return { user: user ?? null }
})
