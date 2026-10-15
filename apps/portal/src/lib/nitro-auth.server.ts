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

import { resolveCookieSessionUser } from "@iefa/supabase-kit"
import { type H3Event, HTTPError } from "nitro/h3"
import { envServer } from "./env.server"

/**
 * @throws 401 sem sessão válida, 503 se o GoTrue não respondeu.
 * @returns o id do usuário — dono da chamada ao modelo e chave dos tetos de consumo.
 */
export async function requirePortalUser(event: H3Event): Promise<{ id: string }> {
	// Sem renovar a sessão (a rota não grava o cookie renovado) e com GoTrue fora como 503,
	// não 401: ver `resolveCookieSessionUser` no @iefa/supabase-kit.
	const session = await resolveCookieSessionUser({
		url: envServer.VITE_IEFA_SUPABASE_URL,
		publishableKey: envServer.VITE_IEFA_SUPABASE_PUBLISHABLE_KEY,
		cookieHeader: event.req.headers.get("cookie") ?? undefined,
	})
	if (!session.ok) {
		// Sem sessão é o caso comum. Recusa do GoTrue/gateway e GoTrue fora ficam no log: uma chave
		// publishable inválida no env dá 401 a todo mundo e, sem isto, pareceria sessão perdida.
		if (session.kind !== "no-session") {
			// biome-ignore lint/suspicious/noConsole: server-side auth diagnostics
			console.warn(`[portal:nitro-auth] ${session.status} ${session.kind}: ${session.reason}`)
		}
		throw new HTTPError({ status: session.status, message: session.status === 401 ? "Não autenticado" : "Autenticação indisponível, tente de novo" })
	}
	const user = session.user

	return { id: user.id }
}
