import { LEGAL_DOC_PATHS, LEGAL_DOC_TITLES } from "@iefa/legal-kit"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useAuth } from "@/hooks/useAuth"
import { acknowledgeLegalDocumentsFn, listPendingLegalDocumentsFn } from "@/server/legal.fn"
import { Button } from "./ui/button"

const pendingLegalQueryKey = ["legal", "pending"] as const

/**
 * Aviso de ciência dos documentos legais vigentes.
 *
 * NÃO é banner de consentimento de cookies, e não bloqueia a navegação: a base
 * legal do tratamento é o art. 7º, III / art. 23 da LGPD (execução de política
 * pública), não consentimento — exigir "aceitar" para prosseguir pediria uma
 * escolha que o usuário não tem. O que ele registra é ciência de uma versão
 * específica de cada documento, e reaparece quando uma versão nova é publicada.
 *
 * Só consulta com sessão: sem o guard, toda visita anônima ao portal (que é
 * público) dispararia um POST que volta 401.
 */
export function LegalNoticeBanner() {
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

	if (!isAuthenticated || !pending || pending.length === 0) return null

	return (
		<section className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card px-4 py-3" aria-label="Aviso sobre documentos legais">
			<div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-xs text-muted-foreground leading-relaxed">
					Documentos legais vigentes:{" "}
					{pending.map((doc, index) => (
						<span key={doc.id}>
							{index > 0 && (index === pending.length - 1 ? " e " : ", ")}
							<Link to={LEGAL_DOC_PATHS["pt-BR"][doc.doc_type]} className="underline underline-offset-2 hover:text-foreground">
								{LEGAL_DOC_TITLES["pt-BR"][doc.doc_type]}
							</Link>
						</span>
					))}
					. Pedidos de acesso, correção ou exclusão de dados: <span className="font-medium text-foreground">iefa@fab.mil.br</span>.
				</p>

				<Button
					size="sm"
					variant="outline"
					className="shrink-0"
					disabled={acknowledge.isPending}
					onClick={() => acknowledge.mutate(pending.map((doc) => doc.id))}
				>
					{acknowledge.isPending ? "Registrando…" : "Estou ciente"}
				</Button>
			</div>
		</section>
	)
}
