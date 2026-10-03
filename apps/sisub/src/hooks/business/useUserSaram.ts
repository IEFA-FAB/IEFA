import type { SaramAccountKind, SaramLinkOutcome, SaramStatus } from "@iefa/database/saram-link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { useAuth } from "@/hooks/auth/useAuth"
import { queryKeys } from "@/lib/query-keys"
import {
	confirmSaramCandidateFn,
	fetchMySaramStatusFn,
	requestSaramLinkFn,
	setOwnAccountKindFn,
	verifySaramByCpfFn,
	withdrawSaramRequestFn,
} from "@/server/saram-link.fn"
import { fetchUserSaramFn } from "@/server/user.fn"

const QUERY_STALE_TIME = 5 * 60_000
const QUERY_GC_TIME = 10 * 60_000

export const userSaramKey = queryKeys.user.saram

export function useUserSaram(userId: string | null) {
	return useQuery({
		queryKey: queryKeys.user.saram(userId),
		queryFn: () => fetchUserSaramFn({ data: { userId: userId as string } }),
		enabled: !!userId,
		staleTime: QUERY_STALE_TIME,
		gcTime: QUERY_GC_TIME,
	})
}

/**
 * Estado do vínculo de SARAM da própria conta (`fetchMySaramStatusFn`). Uma consulta por sessão
 * alimenta o aviso de entrada, a tela "Meu cadastro militar", o perfil e o arranchamento.
 */
export function useSaramStatus(options: { enabled?: boolean } = {}) {
	const { user } = useAuth()
	const userId = user?.id ?? null
	return useQuery({
		queryKey: queryKeys.user.saramStatus(userId),
		queryFn: () => fetchMySaramStatusFn(),
		enabled: !!userId && (options.enabled ?? true),
		staleTime: QUERY_STALE_TIME,
		gcTime: QUERY_GC_TIME,
		// Aviso e sinalização são acessórios: falha de leitura não vira erro na tela de quem só quer arranchar.
		retry: 1,
	})
}

/** As mutações da própria conta. A tela recebe a interface, e a pré-visualização a substitui. */
export type SaramLinkApi = {
	confirmCandidate(input: { candidateRef: number; cpfSuffix?: string }): Promise<SaramLinkOutcome>
	verifyByCpf(input: { saram: string; cpf: string }): Promise<SaramLinkOutcome>
	requestLink(input: { saram: string; justification: string }): Promise<SaramLinkOutcome>
	withdrawRequest(input: { requestId: string }): Promise<SaramLinkOutcome>
	setAccountKind(input: { kind: SaramAccountKind }): Promise<SaramLinkOutcome>
	/** Relê o estado (depois de um erro: o pedido pode ter sido decidido, a carga do cadastro pode ter mudado). */
	refresh(): Promise<unknown>
}

/**
 * Chamadas reais. Toda mutação devolve o estado novo: ele entra no cache na hora (o aviso some, a
 * tela troca de passo) e o que depende do SARAM visível (perfil, nome no menu, dados militares) é
 * relido.
 */
export function useSaramLinkApi(): SaramLinkApi {
	const queryClient = useQueryClient()
	const { user } = useAuth()
	const userId = user?.id ?? null

	return useMemo(() => {
		const settle = async (result: SaramLinkOutcome): Promise<SaramLinkOutcome> => {
			queryClient.setQueryData<SaramStatus>(queryKeys.user.saramStatus(userId), result.status)
			await Promise.all([
				// `exact`: a chave do estado começa com a do SARAM, e o estado acabou de chegar.
				queryClient.invalidateQueries({ queryKey: queryKeys.user.saram(userId), exact: true }),
				queryClient.invalidateQueries({ queryKey: queryKeys.user.data(userId ?? undefined) }),
				queryClient.invalidateQueries({ queryKey: ["military"] }),
				// Virar conta de seção cancela os arranchamentos de hoje em diante.
				queryClient.invalidateQueries({ queryKey: ["arranchamentos", userId ?? undefined] }),
			])
			return result
		}
		return {
			confirmCandidate: (data) => confirmSaramCandidateFn({ data }).then(settle),
			verifyByCpf: (data) => verifySaramByCpfFn({ data }).then(settle),
			requestLink: (data) => requestSaramLinkFn({ data }).then(settle),
			withdrawRequest: (data) => withdrawSaramRequestFn({ data }).then(settle),
			setAccountKind: (data) => setOwnAccountKindFn({ data }).then(settle),
			refresh: () => queryClient.invalidateQueries({ queryKey: queryKeys.user.saramStatus(userId) }),
		}
	}, [queryClient, userId])
}
