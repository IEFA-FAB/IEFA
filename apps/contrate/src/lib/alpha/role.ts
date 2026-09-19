/**
 * Perfil do usuário no Projeto α — `GET /api/v1/me/access`.
 *
 * Quatro papéis (requisitante, licitações, ACI, administração), cada um com a cobertura de
 * OMs JÁ expandida pela hierarquia de apoio: `"all"` é o grant global, a lista são os ids.
 * Quem resolve é o α, sobre o PBAC; o contrate não lê grant do banco para decidir o que a
 * tela oferece — só o que ele mesmo administra (a tela de acessos) passa por server fn.
 *
 * O contrato é o de `@iefa/alpha-client/access`, e a resposta é conferida contra ele: um α
 * que mudasse o formato faria a tela esconder módulo de quem tem papel, em silêncio.
 */

import { type AlphaRole, type MeAccess, MeAccessSchema } from "@iefa/alpha-client/access"
import { queryOptions } from "@tanstack/react-query"
import { alphaRequest } from "./client"

export type { AccessUnit, AlphaRole, MeAccess, UnitOption, UnitSet } from "@iefa/alpha-client/access"

/**
 * Teto da consulta do perfil. Ela roda no `beforeLoad` das rotas com OM: sem teto, um α
 * pendurado prenderia a navegação inteira, sem mensagem.
 */
const ACCESS_TIMEOUT_MS = 15_000

export const ALPHA_ACCESS_QUERY_KEY = ["alpha", "me", "access"] as const

export const ROLE_LABEL: Record<AlphaRole, string> = {
	requester: "Requisitante",
	procurement: "Licitações",
	aci: "ACI",
	admin: "Administração de acessos",
}

export function alphaAccessQueryOptions(token: string | undefined) {
	return queryOptions({
		queryKey: ALPHA_ACCESS_QUERY_KEY,
		queryFn: async (): Promise<MeAccess> =>
			MeAccessSchema.parse(await alphaRequest<unknown>("/api/v1/me/access", token, { signal: AbortSignal.timeout(ACCESS_TIMEOUT_MS) })),
		enabled: !!token,
		staleTime: 60_000,
	})
}
