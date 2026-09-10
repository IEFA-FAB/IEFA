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

import type { AppModule } from "@iefa/pbac"
import { hasAnyPermission, resolveUserPermissions } from "@iefa/pbac"
import { createCookieAuthClient } from "@iefa/supabase-kit"
import { type H3Event, HTTPError } from "nitro/h3"
import { envServer } from "#/lib/env.server"
import { SUCONT_DIVISION_MODULES } from "#/lib/permission-modules"
import { getAccessControlClient } from "#/lib/supabase.server"

/**
 * @param modules módulos do PBAC que autorizam a rota — o padrão é "qualquer uma das
 *   três divisões", para o endpoint que não é de uma ferramenta específica. Rota de
 *   ferramenta passa a divisão DELA: o `/api/sacdgc/analyze` é da SUCONT-1, e aceitá-lo
 *   de qualquer divisão desfaria, pela porta dos fundos, a separação que os guards de
 *   rota e as server functions aplicam.
 * @throws 401 sem sessão válida, 403 sem grant em nenhum dos módulos.
 * @returns o id do usuário — dono da chamada ao modelo e chave dos tetos.
 */
export async function requireSucontUser(event: H3Event, modules: readonly AppModule[] = SUCONT_DIVISION_MODULES): Promise<{ id: string }> {
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
	if (!hasAnyPermission(permissions, modules, 1)) {
		throw new HTTPError({ status: 403, message: "Permissão insuficiente" })
	}

	return { id: user.id }
}
