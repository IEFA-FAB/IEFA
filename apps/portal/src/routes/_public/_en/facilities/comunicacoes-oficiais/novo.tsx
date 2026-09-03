import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { DocumentEditor } from "@/components/comaer/DocumentEditor"

/**
 * Documento novo: começa do rascunho do navegador, que é o que sobrevive a um F5 no meio
 * da redação. Ao ser salvo pela primeira vez ele ganha endereço próprio e a rota passa a
 * ser a dele.
 */
export const Route = createFileRoute("/_public/_en/facilities/comunicacoes-oficiais/novo")({
	// `?minuta=true` vem do atalho da biblioteca: abre já no formulário, com a importação
	// à mão, em vez de exigir entrar, trocar de modo e rolar.
	validateSearch: z.object({ minuta: z.boolean().optional() }),
	component: NovoDocumento,
	head: () => ({ meta: [{ title: "Novo documento | Comunicações Oficiais" }] }),
})

function NovoDocumento() {
	const { minuta } = Route.useSearch()
	return <DocumentEditor documentId={null} initialDocument={null} startInImport={minuta === true} />
}
