/**
 * @module auth.fn
 * Validação de sessão server-side via Supabase Auth.
 * Usa getRumaerAuthClient (valida o JWT no servidor via cookies — não localStorage).
 * Não lança quando deslogado: retorna { user: null, session: null }.
 */

import { createServerFn } from "@tanstack/react-start"
import { getRumaerAuthClient } from "@/lib/supabase.server"

export const getServerSessionFn = createServerFn({ method: "GET" }).handler(async () => {
	const supabase = getRumaerAuthClient()
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
