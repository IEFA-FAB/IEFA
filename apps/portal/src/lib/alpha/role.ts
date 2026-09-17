/**
 * Perfil do usuário no Projeto α.
 *
 * Vem do PBAC (módulos `alpha` e `alpha-admin` em `access_control.user_permissions`),
 * resolvido pelo próprio α em `GET /api/v1/me/access`. O portal não lê permissão do
 * banco nem da sessão: a regra de acesso mora no α, e aqui é só o que a tela precisa
 * para não oferecer botão que vai devolver 403.
 */

import { queryOptions } from "@tanstack/react-query"
import { alphaRequest } from "./client"

export type AlphaLevel = 0 | 1 | 2 | 3

export type AlphaAccess = {
	level: AlphaLevel
	/** Licitações e ACI: a fila e os processos de todos os requisitantes. */
	can_see_all: boolean
	/** Só o ACI: triagem de achado e parecer. */
	can_decide: boolean
	/** `alpha-admin` 3: conceder e revogar os grants do α. */
	can_manage_access: boolean
}

export const LEVEL_LABEL: Record<AlphaLevel, string> = {
	0: "sem perfil",
	1: "Requisitante",
	2: "Licitações",
	3: "ACI",
}

export function alphaAccessQueryOptions(token: string | undefined) {
	return queryOptions({
		queryKey: ["alpha", "me", "access"],
		queryFn: () => alphaRequest<AlphaAccess>("/api/v1/me/access", token),
		enabled: !!token,
		staleTime: 60_000,
	})
}
