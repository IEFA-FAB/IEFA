/**
 * @module nitro-auth.server
 * Sessão + permissão PBAC dentro de rotas Nitro.
 *
 * Rota Nitro roda fora do contexto de request do TanStack Start, então os helpers
 * de `#/lib/auth.server` (que dependem de `getRequest()`) não valem lá. A sessão
 * vem do header `Cookie` do H3Event e a permissão da mesma engine PBAC do resto do
 * app.
 *
 * Mora aqui, e não dentro de cada rota, porque o guard de rota do `__root` é
 * client-side: toda rota Nitro que fale com o Bedrock precisa desta checagem, e uma
 * cópia por arquivo é uma cópia que um dia sai do ar sem ninguém notar.
 */

import { hasPermission, resolveUserPermissions } from "@iefa/pbac"
import { createCookieAuthClient } from "@iefa/supabase-kit"
import { type H3Event, HTTPError } from "nitro/h3"
import { envServer } from "#/lib/env.server"
import { getAccessControlClient } from "#/lib/supabase.server"

/**
 * @throws 401 sem sessão válida, 403 sem grant `sucont` nível 1.
 * @returns o id do usuário — dono da chamada ao modelo e chave dos tetos.
 */
export async function requireSucontUser(event: H3Event): Promise<{ id: string }> {
	const auth = createCookieAuthClient({
		url: envServer.VITE_SUCONT_SUPABASE_URL,
		key: envServer.VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY,
		cookieHeader: event.req.headers.get("cookie") ?? undefined,
	})

	const {
		data: { user },
		error,
	} = await auth.auth.getUser()
	if (!user || error) throw new HTTPError({ status: 401, message: "Não autenticado" })

	const permissions = await resolveUserPermissions(user.id, getAccessControlClient())
	if (!hasPermission(permissions, "sucont", 1)) {
		throw new HTTPError({ status: 403, message: "Permissão insuficiente" })
	}

	return { id: user.id }
}
