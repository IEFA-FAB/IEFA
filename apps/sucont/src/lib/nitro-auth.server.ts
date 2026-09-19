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

import { checkSameOriginJsonRequest } from "@iefa/auth-kit"
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

/**
 * Guard de CSRF das rotas Nitro que leem corpo JSON com a sessão do cookie.
 *
 * O `readBody` do h3 faz `JSON.parse` de qualquer content-type, e o cookie do
 * Supabase é `SameSite=Lax`: uma página em outro subdomínio de `iefa.com.br` (que é
 * "same-site") conseguia disparar um POST `text/plain` sem preflight e queimar o
 * Bedrock com a sessão da vítima. Exige `application/json` e `Origin`/`Referer` do
 * próprio app — ver `checkSameOriginJsonRequest` no auth-kit.
 *
 * Chamar ANTES de `requireSucontUser` e do `readBody`.
 * @throws 403 se o pedido não vier do próprio app como JSON.
 */
export function requireSameOriginJson(event: H3Event): void {
	const check = checkSameOriginJsonRequest(event.req.headers, event.req.url)
	if (!check.ok) throw new HTTPError({ status: 403, message: `Requisição recusada: ${check.reason}` })
}
