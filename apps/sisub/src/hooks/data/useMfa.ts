import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import type { ActiveSessionList, MfaOverview } from "@/server/mfa.fn"
import {
	cancelMfaEnrollmentFn,
	getMfaOverviewFn,
	listActiveSessionsFn,
	signOutOtherSessionsFn,
	startMfaEnrollmentFn,
	unenrollMfaFactorFn,
	verifyMfaChallengeFn,
	verifyMfaEnrollmentFn,
} from "@/server/mfa.fn"

export type { ActiveSessionList, MfaOverview }

// ============================================================================
// Query Options
// ============================================================================

export const mfaOverviewQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.sisub.mfaOverview(),
		queryFn: () => getMfaOverviewFn(),
		// Curto de propósito: o cartão do perfil e a tela de segurança precisam refletir um
		// cadastro concluído em outra aba sem esperar um ciclo longo de cache.
		staleTime: 15 * 1000,
	})

export const activeSessionsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.sisub.activeSessions(),
		queryFn: () => listActiveSessionsFn(),
		staleTime: 15 * 1000,
	})

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * `enabled` existe para o aviso de obrigatoriedade, que vive no layout `_protected` e
 * portanto renderiza em TODA tela do sistema: sem prazo anunciado ele desliga a consulta, e
 * a leitura do painel de MFA (uma ida ao GoTrue por chamada) não entra no caminho de cada
 * navegação. As telas de segurança chamam sem argumento e seguem como antes.
 */
export function useMfaOverview(options?: { enabled?: boolean }) {
	return useQuery({ ...mfaOverviewQueryOptions(), enabled: options?.enabled ?? true })
}

export function useActiveSessions() {
	return useQuery(activeSessionsQueryOptions())
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Nenhum hook daqui exibe toast de erro: os fluxos de MFA mostram o erro DENTRO do
 * formulário, ao lado do campo que o causou. Um toast que some em 4 segundos é o pior lugar
 * possível para "o código está incorreto" — some antes de a pessoa terminar de digitar o
 * próximo.
 */
export function useStartMfaEnrollment() {
	return useMutation({
		mutationFn: (input: { friendlyName: string; password?: string }) => startMfaEnrollmentFn({ data: input }),
	})
}

export function useVerifyMfaEnrollment() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (input: { factorId: string; code: string }) => verifyMfaEnrollmentFn({ data: input }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.sisub.mfaOverview() })
			queryClient.invalidateQueries({ queryKey: queryKeys.sisub.activeSessions() })
		},
	})
}

export function useCancelMfaEnrollment() {
	return useMutation({
		mutationFn: (factorId: string) => cancelMfaEnrollmentFn({ data: { factorId } }),
	})
}

export function useUnenrollMfaFactor() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (factorId: string) => unenrollMfaFactorFn({ data: { factorId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.sisub.mfaOverview() })
		},
	})
}

export function useVerifyMfaChallenge() {
	return useMutation({
		mutationFn: (input: { factorId: string; code: string }) => verifyMfaChallengeFn({ data: input }),
	})
}

export function useSignOutOtherSessions() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: () => signOutOtherSessionsFn(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.sisub.activeSessions() })
		},
	})
}
