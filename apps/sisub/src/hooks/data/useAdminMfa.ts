import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAssuredMutation } from "@/hooks/auth/useAssuredMutation"
import type { ResetUserMfa } from "@/lib/mfa-admin-reset"
import { queryKeys } from "@/lib/query-keys"
import type { AdminMfaResetResult, AdminUserMfaStatus } from "@/server/mfa-admin.fn"
import { getUserMfaStatusFn, resetUserMfaFn } from "@/server/mfa-admin.fn"

export type { AdminMfaResetResult, AdminUserMfaStatus }

/**
 * Estado de MFA de OUTRO usuário — só a tela de gestão de acesso consome, e o servidor exige
 * `admin` nível 3 nas duas fns.
 */
export const userMfaStatusQueryOptions = (userId: string | null | undefined) =>
	queryOptions({
		queryKey: queryKeys.sisub.adminUserMfa(userId),
		queryFn: () => getUserMfaStatusFn({ data: { targetUserId: userId as string } }),
		enabled: !!userId,
		// Curto: o administrador costuma abrir a tela logo depois de falar com o titular ao
		// telefone, e uma contagem de dispositivos velha levaria a uma decisão sobre um estado
		// que já mudou.
		staleTime: 15 * 1000,
	})

export function useUserMfaStatus(userId: string | null | undefined) {
	return useQuery(userMfaStatusQueryOptions(userId))
}

/**
 * Remove o segundo fator do titular.
 *
 * Sem toast aqui: o diálogo mostra o erro ao lado dos campos que o causaram (justificativa
 * curta, confirmação não marcada) e o resultado — inclusive se o aviso por e-mail saiu — na
 * própria tela. Um toast que some em 4 segundos é o pior lugar para o desfecho de uma
 * operação irreversível.
 *
 * `useAssuredMutation` porque `resetUserMfaFn` é `"fresh"` (`admin` nível 3): é o ponto em que
 * o administrador prova a própria identidade para apagar a de outra pessoa (design.md D10).
 * Quando o piso subir, a recusa abre o modal SOBRE o diálogo já preenchido e o reset é
 * reenviado com a MESMA justificativa — redigitá-la seria o caminho mais curto para uma
 * justificativa vazia de conteúdo.
 */
export function useResetUserMfa() {
	const queryClient = useQueryClient()

	return useAssuredMutation({
		mutationFn: (input: ResetUserMfa) => resetUserMfaFn({ data: input }),
		onSuccess: (_result, input) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.sisub.adminUserMfa(input.targetUserId) })
		},
	})
}
