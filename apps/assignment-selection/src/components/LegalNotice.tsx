import { LegalNoticeBanner as LegalNoticeBannerUI } from "@iefa/legal-kit/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { authQueryOptions } from "@/lib/auth"
import { acknowledgeLegalDocumentsFn, listPendingLegalDocumentsFn } from "@/server/legal.fn"

const pendingLegalQueryKey = ["legal", "pending"] as const

/**
 * Aviso de ciência dos documentos legais vigentes.
 *
 * `useQuery(authQueryOptions())` e NÃO o hook `useAuth()`: aquele usa
 * `useSuspenseQuery` e exige preload num `beforeLoad`. Este componente é montado
 * no `__root`, que cobre o telão público (`/`) — rota sem `beforeLoad` de auth.
 * Com o hook suspenso, o telão travaria no primeiro render.
 *
 * A consulta só dispara com sessão; sem ela o telão não faz chamada nenhuma.
 */
export function LegalNotice() {
	const isAuthenticated = useQuery(authQueryOptions()).data?.isAuthenticated ?? false
	const queryClient = useQueryClient()

	const { data: pending } = useQuery({
		queryKey: pendingLegalQueryKey,
		queryFn: () => listPendingLegalDocumentsFn(),
		enabled: isAuthenticated,
		staleTime: 5 * 60 * 1000,
		retry: false,
	})

	const acknowledge = useMutation({
		mutationFn: (documentIds: string[]) => acknowledgeLegalDocumentsFn({ data: { documentIds } }),
		onSuccess: () => queryClient.setQueryData(pendingLegalQueryKey, []),
	})

	if (!isAuthenticated) return null

	return <LegalNoticeBannerUI pending={pending} onAcknowledge={(ids) => acknowledge.mutate(ids)} isPending={acknowledge.isPending} />
}
