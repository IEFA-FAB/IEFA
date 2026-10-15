/**
 * @module nitro-auth.server
 * Sessão dentro de rota Nitro (`routes/api/**`).
 *
 * Rota Nitro roda fora do contexto de request do TanStack Start, então
 * `getSupabaseAuthClient()` — que depende de `getRequest()` — não vale lá. A sessão vem do
 * header `Cookie` do próprio evento H3, por `resolveCookieSessionUser` do kit: valida o token
 * sem renovar a sessão (a rota não tem como gravar o cookie renovado) e separa "sem sessão"
 * (401) de "GoTrue fora" (503).
 */

import { resolveCookieSessionUser } from "@iefa/supabase-kit"
import { type H3Event, HTTPError } from "h3"
import { envServer } from "@/lib/env.server"

/**
 * @throws 401 sem sessão válida; 503 se o GoTrue não respondeu.
 * @returns o id do usuário da sessão.
 */
export async function requireSisubUser(event: H3Event): Promise<{ id: string }> {
	const session = await resolveCookieSessionUser({
		url: envServer.VITE_SISUB_SUPABASE_URL,
		publishableKey: envServer.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY,
		cookieHeader: event.req.headers.get("cookie") ?? undefined,
	})
	if (!session.ok) {
		throw new HTTPError({ status: session.status, message: session.status === 401 ? "Não autenticado" : "Autenticação indisponível, tente de novo" })
	}
	return { id: session.user.id }
}
