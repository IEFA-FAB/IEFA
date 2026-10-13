import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { useAssuranceElevation } from "@/components/features/assurance/AssuranceElevationProvider"
import type { SaramAdminApi } from "@/components/features/military-record/SaramReviewConsole"
import { runWithElevation } from "@/lib/assurance/assurance-error"
import { queryKeys } from "@/lib/query-keys"
import {
	decideSaramRequestFn,
	fetchSaramReviewQueueFn,
	linkUserSaramFn,
	searchSaramAccountsFn,
	setUserAccountKindFn,
	unlinkUserSaramFn,
} from "@/server/saram-admin.fn"

/** Filas do console "Cadastro militar" (admin:2). Curto: quem abre a tela costuma estar decidindo. */
export function useSaramReviewQueue(options: { enabled?: boolean } = {}) {
	return useQuery({
		enabled: options.enabled ?? true,
		queryKey: queryKeys.user.saramReviewQueue(),
		queryFn: () => fetchSaramReviewQueueFn(),
		staleTime: 30_000,
		refetchOnWindowFocus: true,
	})
}

/**
 * As decisões do console, cada uma com a elevação de garantia (`fresh` no registro): recusada por
 * falta de segundo fator recente, o modal de 6 dígitos abre e a MESMA chamada é reenviada.
 */
export function useSaramAdminApi(): SaramAdminApi {
	const queryClient = useQueryClient()
	const { requestElevation } = useAssuranceElevation()

	return useMemo(
		() => ({
			decide: (data) => runWithElevation(data, (d) => decideSaramRequestFn({ data: d }), requestElevation),
			link: (data) => runWithElevation(data, (d) => linkUserSaramFn({ data: d }), requestElevation),
			unlink: (data) => runWithElevation(data, (d) => unlinkUserSaramFn({ data: d }), requestElevation),
			setKind: (data) => runWithElevation(data, (d) => setUserAccountKindFn({ data: d }), requestElevation),
			search: (query) => searchSaramAccountsFn({ data: { query } }),
			refresh: () => queryClient.invalidateQueries({ queryKey: queryKeys.user.saramReviewQueue() }),
		}),
		[queryClient, requestElevation]
	)
}
