import type { User } from "@supabase/supabase-js"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import { fetchMySaramStatusFn, type SaramStatus } from "@/server/saram-link.fn"
import { fetchUserSaramFn, syncUserSaramFn } from "@/server/user.fn"

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
 * Estado do vínculo de SARAM (`fetchMySaramStatusFn`). O primeiro acesso só insiste no SARAM
 * quando há o que a pessoa possa fazer por ali: conta institucional, pedido em análise ou
 * bloqueio de tentativas não reabrem o diálogo a cada sessão.
 */
export function useSaramStatus(userId: string | null) {
	return useQuery({
		queryKey: queryKeys.user.saramStatus(userId),
		queryFn: () => fetchMySaramStatusFn(),
		enabled: !!userId,
		staleTime: QUERY_STALE_TIME,
		gcTime: QUERY_GC_TIME,
	})
}

/** Estados em que o diálogo de SARAM do primeiro acesso tem ação a oferecer. */
export function saramStatusNeedsAction(status: SaramStatus | undefined): boolean {
	return status?.status === "suggestion" || status?.status === "homonyms" || status?.status === "no_match"
}

export function useUpdateSaram() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ user, saram }: { user: User; saram: string }) => syncUserSaramFn({ data: { userId: user.id, email: user.email ?? "", saram } }),
		onMutate: async ({ user, saram }) => {
			const queryKey = queryKeys.user.saram(user.id)
			await queryClient.cancelQueries({ queryKey })
			const previous = queryClient.getQueryData(queryKey)
			queryClient.setQueryData(queryKey, saram)
			return { previous, queryKey }
		},
		onError: (_error, _, context) => {
			if (context?.previous) {
				queryClient.setQueryData(context.queryKey, context.previous)
			}
		},
		onSuccess: (result, { user }) => {
			if (result?.outcome === "requested" || result?.outcome === "pending" || result?.outcome === "disputed") {
				toast.info("Pedido de vínculo enviado à administração", {
					description: "O SARAM informado não pôde ser conferido pelo seu e-mail. Até a decisão, os dados militares não aparecem; o arranchamento continua.",
				})
			}
			// O número pode ter virado pedido (sem SARAM visível): o estado decide o que a tela mostra.
			queryClient.invalidateQueries({ queryKey: queryKeys.user.saram(user.id) })
			queryClient.invalidateQueries({ queryKey: queryKeys.user.saramStatus(user.id) })
		},
	})
}
