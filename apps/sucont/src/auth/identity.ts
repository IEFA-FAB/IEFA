/**
 * Identidade da pessoa por trás da sessão — SARAM vinculado e a identificação
 * militar que ele resolve.
 *
 * Mora ao lado de `auth/pbac.ts` pelo mesmo motivo: é leitura do domínio de
 * acesso, não de uma tela. Quem a consome são o diálogo de vínculo do SARAM e,
 * indiretamente, a lista de acessos — que resolve a identidade no servidor.
 */

import { queryOptions } from "@tanstack/react-query"
import { fetchMyIdentityFn } from "#/server/user.fn"

export const myIdentityQueryOptions = () =>
	queryOptions({
		queryKey: ["sucont", "myIdentity"] as const,
		queryFn: () => fetchMyIdentityFn(),
		// Muda uma vez na vida da conta; sem sessão a fn responde 401 e insistir só
		// gastaria requisição.
		staleTime: 30 * 60_000,
		retry: false,
	})
