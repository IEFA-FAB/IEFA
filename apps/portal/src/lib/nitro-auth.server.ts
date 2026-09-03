/**
 * @module nitro-auth.server
 * Sessão dentro de rota Nitro.
 *
 * Rota Nitro roda fora do contexto de request do TanStack Start, então os helpers de
 * `@/lib/auth.server` — que dependem de `getRequest()` — não valem lá. A sessão vem do
 * header `Cookie` do próprio evento H3.
 *
 * Mora aqui, e não dentro da rota, porque o `beforeLoad` da rota da ferramenta é
 * client-side: ele protege a navegação, não o endpoint. Toda rota Nitro que fale com o
 * Bedrock precisa desta checagem, e uma cópia por arquivo é uma cópia que um dia sai do ar
 * sem ninguém notar.
 */

import { createCookieAuthClient } from "@iefa/supabase-kit"
import { type H3Event, HTTPError } from "nitro/h3"
import { envServer } from "./env.server"

/**
 * @throws 401 sem sessão válida.
 * @returns o id do usuário — dono da chamada ao modelo e chave dos tetos de consumo.
 */
export async function requirePortalUser(event: H3Event): Promise<{ id: string }> {
	const auth = createCookieAuthClient({
		url: envServer.VITE_IEFA_SUPABASE_URL,
		// Chave publishable, nunca a service role: `getUser()` valida o JWT do cookie no
		// servidor do Supabase de qualquer forma, e uma query acidental por este client não
		// pode burlar a RLS.
		key: envServer.VITE_IEFA_SUPABASE_PUBLISHABLE_KEY,
		cookieHeader: event.req.headers.get("cookie") ?? undefined,
	})

	const {
		data: { user },
		error,
	} = await auth.auth.getUser()
	if (!user || error) throw new HTTPError({ status: 401, message: "Não autenticado" })

	return { id: user.id }
}
