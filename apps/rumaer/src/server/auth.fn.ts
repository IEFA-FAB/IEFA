/**
 * @module auth.fn
 * Validação de sessão server-side via Supabase Auth.
 * Usa getRumaerAuthClient (valida o JWT no servidor via cookies — não localStorage).
 * Não lança quando deslogado: retorna { user: null }.
 */

import { createServerFn } from "@tanstack/react-start"
import { getRumaerAuthClient } from "@/lib/supabase.server"

// Público por contrato: valida o JWT do request e devolve { user: null } sem sessão.
// nosemgrep: server-fn-missing-auth-guard
export const getServerSessionFn = createServerFn({ method: "GET" }).handler(async () => {
	const supabase = getRumaerAuthClient()
	// Só getUser(): valida o JWT contra o Supabase. A sessão (access/refresh token) NÃO volta
	// daqui: ia serializada no HTML do SSR e no cache do React Query, ao alcance de qualquer
	// script da página. O navegador mantém a própria sessão pelo supabase-js
	// (onAuthStateChange). Mesmo desenho do sucont.
	const {
		data: { user },
	} = await supabase.auth.getUser()

	return { user: user ?? null }
})
