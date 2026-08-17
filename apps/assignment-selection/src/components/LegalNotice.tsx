import { LegalNoticeBanner as LegalNoticeBannerUI } from "@iefa/legal-kit/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { authQueryOptions } from "@/lib/auth"
import { acknowledgeLegalDocumentsFn, listPendingLegalDocumentsFn } from "@/server/legal.fn"

const pendingLegalQueryKey = ["legal", "pending"] as const

/**
 * Aviso de ciência dos documentos legais vigentes.
 *
 * Montado em `/controller`, NÃO no `__root`. O `__root` cobre o telão público
 * (`/`), que roda sem sessão numa tela de projeção: lá este componente só somaria
 * um round-trip de `getServerSessionFn()` por carga, para depois não renderizar
 * nada. `/controller` já exige sessão no `beforeLoad`, então a consulta de auth
 * abaixo é servida pelo cache.
 *
 * `useQuery(authQueryOptions())` e não o hook `useAuth()`: aquele usa
 * `useSuspenseQuery`, e suspender por causa de um aviso de rodapé seria trocar o
 * conteúdo da tela por um fallback enquanto se resolve algo acessório.
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
