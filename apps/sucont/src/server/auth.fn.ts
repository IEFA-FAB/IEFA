/**
 * @module auth.fn
 * Validação de sessão server-side via Supabase Auth.
 * Usa getSucontAuthClient (valida o JWT no servidor via cookies — não localStorage).
 * Não lança quando deslogado: retorna { user: null }.
 */

import { createServerFn } from "@tanstack/react-start"
import { getSucontAuthClient } from "#/lib/supabase.server"

// Público por contrato: valida o JWT do request e devolve { user: null } sem sessão.
// nosemgrep: server-fn-missing-auth-guard
export const getServerSessionFn = createServerFn({ method: "GET" }).handler(async () => {
	const supabase = getSucontAuthClient()
	// Só getUser(): valida o JWT contra o servidor Supabase (fonte de verdade). NÃO
	// usar getSession() no servidor — ele lê o cookie sem verificar (claims stale/
	// revogados) e não deve ser propagado ao cliente. A sessão do browser vem do
	// client-side (onAuthStateChange), não daqui.
	const {
		data: { user },
	} = await supabase.auth.getUser()

	return { user: user ?? null }
})
