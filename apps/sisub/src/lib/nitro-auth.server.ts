/**
 * @module nitro-auth.server
 * Sessão dentro de rota Nitro (`routes/api/**`).
 *
 * Rota Nitro roda fora do contexto de request do TanStack Start, então
 * `getSupabaseAuthClient()` — que depende de `getRequest()` — não vale lá. A sessão vem do
 * header `Cookie` do próprio evento H3, pelo `createCookieAuthClient` do kit (deadline de auth
 * de 5 s, contra o upstream degradado que virava 502/504 no ALB).
 *
 * Mora aqui, e não em cada rota, porque as duas rotas de chat montavam o client à mão com a
 * service key: uma query acidental por ele rodaria como service_role e burlaria a RLS, o bug
 * que o #211 corrigiu no resto do app.
 */

import { createCookieAuthClient } from "@iefa/supabase-kit"
import { type H3Event, HTTPError } from "h3"
import { envServer } from "@/lib/env.server"

/**
 * @throws 401 sem sessão válida.
 * @returns o id do usuário da sessão.
 */
export async function requireSisubUser(event: H3Event): Promise<{ id: string }> {
	const auth = createCookieAuthClient({
		url: envServer.VITE_SISUB_SUPABASE_URL,
		// Publishable/anon — NUNCA a service key: getUser() valida o JWT do cookie no servidor
		// Supabase de qualquer forma. Guard: opengrep `auth-client-secret-key`.
		key: envServer.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY,
		cookieHeader: event.req.headers.get("cookie") ?? undefined,
	})

	const {
		data: { user },
		error,
	} = await auth.auth.getUser()
	if (!user || error) throw new HTTPError({ status: 401, message: "Não autenticado" })

	return { id: user.id }
}
