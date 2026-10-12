import { LegalNoticeBanner as LegalNoticeBannerUI } from "@iefa/legal-kit/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { acknowledgeLegalDocumentsFn, listPendingLegalDocumentsFn } from "@/server/legal.fn"

const pendingLegalQueryKey = ["legal", "pending"] as const

/**
 * Aviso de ciência dos documentos legais vigentes.
 *
 * Busca e registro ficam aqui — a apresentação vem de `@iefa/legal-kit/react`,
 * compartilhada com os demais apps sem contrato visual próprio.
 *
 * A consulta só dispara com sessão: sem o guard, cada visita anônima geraria uma
 * chamada que volta 401. `retry: false` porque falhar aqui é degradação aceitável
 * — um erro visível sobre "documentos legais" não seria acionável pelo usuário.
 */
export function LegalNotice() {
	const { isAuthenticated } = useAuth()
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
