/**
 * Vínculo de SARAM da pessoa por trás da sessão (`core.saram_link_status`, a mesma função do
 * sisub — change `saram-verified-link`).
 *
 * Mora ao lado de `auth/pbac.ts` pelo mesmo motivo: é leitura do domínio de acesso, não de uma
 * tela. Quem a consome são o aviso de entrada e o diálogo "Meu cadastro militar"; a lista de
 * acessos resolve a identidade dos outros no servidor.
 */

import { queryOptions } from "@tanstack/react-query"
import { fetchMySaramStatusFn } from "#/server/user.fn"

export const mySaramStatusQueryKey = ["sucont", "saramStatus"] as const

export const mySaramStatusQueryOptions = () =>
	queryOptions({
		queryKey: mySaramStatusQueryKey,
		queryFn: () => fetchMySaramStatusFn(),
		// Muda raramente e só por ação da própria pessoa (que grava o estado novo no cache) ou da
		// administração; sem sessão a fn responde 401 e insistir só gastaria requisição.
		staleTime: 10 * 60_000,
		retry: false,
	})
