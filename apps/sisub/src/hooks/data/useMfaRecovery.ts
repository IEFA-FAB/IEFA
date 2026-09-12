import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import type { ConsumedRecoveryCodeResult, GeneratedRecoveryCodesResult, RecoveryCodeOverview } from "@/server/mfa-recovery.fn"
import { consumeRecoveryCodeFn, generateRecoveryCodesFn, getRecoveryCodeOverviewFn } from "@/server/mfa-recovery.fn"

export type { ConsumedRecoveryCodeResult, GeneratedRecoveryCodesResult, RecoveryCodeOverview }

export const recoveryCodeOverviewQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.sisub.recoveryCodes(),
		queryFn: () => getRecoveryCodeOverviewFn(),
		staleTime: 15 * 1000,
	})

export function useRecoveryCodeOverview() {
	return useQuery(recoveryCodeOverviewQueryOptions())
}

/**
 * Emite dez códigos novos.
 *
 * O retorno traz o texto claro e ele fica SÓ na memória do componente que abre o diálogo —
 * nunca no cache do react-query, que sobrevive a navegações e é inspecionável pelas
 * devtools. Por isso não há `setQueryData` aqui: o que se invalida é a CONTAGEM.
 */
export function useGenerateRecoveryCodes() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: () => generateRecoveryCodesFn(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.sisub.recoveryCodes() })
			queryClient.invalidateQueries({ queryKey: queryKeys.sisub.mfaOverview() })
		},
	})
}

/**
 * Consome um código de recuperação.
 *
 * Sem `invalidateQueries`: a conclusão deste fluxo é sempre uma navegação de página inteira
 * (a remoção do fator encerra as sessões do titular no GoTrue), e invalidar um cache que vai
 * ser descartado só dispararia requisições com uma sessão que já não existe.
 */
export function useConsumeRecoveryCode() {
	return useMutation({
		mutationFn: (code: string) => consumeRecoveryCodeFn({ data: { code } }),
	})
}
