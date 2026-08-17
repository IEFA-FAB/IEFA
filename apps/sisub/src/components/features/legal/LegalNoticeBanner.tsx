import { LEGAL_DOC_PATHS, LEGAL_DOC_TITLES } from "@iefa/legal-kit"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { acknowledgeLegalDocumentsFn, listPendingLegalDocumentsFn } from "@/server/legal.fn"

const pendingLegalQueryKey = ["legal", "pending"] as const

/**
 * Aviso de ciência dos documentos legais vigentes.
 *
 * NÃO é um banner de consentimento de cookies, e não bloqueia a navegação: a base
 * legal do tratamento é o art. 7º, III / art. 23 da LGPD (execução de política
 * pública), não consentimento — um modal que exigisse "aceitar" para prosseguir
 * pediria uma escolha que o usuário não tem, e um aceite coagido é pior que nenhum.
 * O que ele registra é ciência de uma versão específica de cada documento.
 *
 * Some quando toda versão vigente já tem ciência registrada, e reaparece sozinho
 * quando uma versão nova é publicada (o registro é por `document_id`).
 */
export function LegalNoticeBanner() {
	const queryClient = useQueryClient()

	const { data: pending } = useQuery({
		queryKey: pendingLegalQueryKey,
		queryFn: () => listPendingLegalDocumentsFn(),
		// Fora do caminho crítico do TTFB: nada nesta tela depende do resultado.
		staleTime: 5 * 60 * 1000,
		// Falha aqui não pode virar erro visível — a ausência do aviso é degradação
		// aceitável; um toast de erro sobre "documentos legais" não é acionável.
		retry: false,
	})

	const acknowledge = useMutation({
		mutationFn: (documentIds: string[]) => acknowledgeLegalDocumentsFn({ data: { documentIds } }),
		onSuccess: () => queryClient.setQueryData(pendingLegalQueryKey, []),
	})

	if (!pending || pending.length === 0) return null

	return (
		<section className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur px-4 py-3" aria-label="Aviso sobre documentos legais">
			<div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-xs text-muted-foreground leading-relaxed">
					Publicamos uma versão nova de{" "}
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
