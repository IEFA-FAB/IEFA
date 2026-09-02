import { createFileRoute } from "@tanstack/react-router"
import { DocumentEditor } from "@/components/comaer/DocumentEditor"
import { fromPayload } from "@/lib/comaer/schema"
import { loadDocumentFn } from "@/server/documents.fn"

/**
 * Editor de um documento salvo.
 *
 * O documento é carregado no `loader`, e não dentro do componente: assim a folha nasce
 * pronta em vez de piscar em branco, e um id de outra pessoa vira 404 antes de qualquer
 * coisa ser renderizada — o filtro por dono está na server function.
 */
export const Route = createFileRoute("/_public/_en/facilities/comunicacoes-oficiais/$documentId")({
	loader: async ({ params }) => {
		const document = await loadDocumentFn({ data: { id: params.documentId } })
		return { document: fromPayload(document.payload), id: document.id }
	},
	component: DocumentRoute,
	head: () => ({ meta: [{ title: "Comunicações Oficiais — Portal IEFA" }] }),
})

function DocumentRoute() {
	const { document, id } = Route.useLoaderData()
	// `key` no id: trocar de documento pela lista precisa remontar o editor, senão o estado
	// do documento anterior (inclusive a pilha de desfazer) atravessaria para o novo.
	return <DocumentEditor key={id} documentId={id} initialDocument={document} />
}
