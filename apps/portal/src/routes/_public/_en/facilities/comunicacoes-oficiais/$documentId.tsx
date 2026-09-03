import { createFileRoute, Link } from "@tanstack/react-router"
import { DocumentEditor } from "@/components/comaer/DocumentEditor"
import { Button } from "@/components/ui/button"
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
	errorComponent: DocumentError,
	head: () => ({ meta: [{ title: "Comunicações Oficiais | Portal IEFA" }] }),
})

/**
 * Falha ao abrir o documento.
 *
 * Sem isto o erro cai na moldura genérica do app, que imprime a mensagem do servidor num
 * bloco de código — e a pessoa lê o dialeto do PostgREST no lugar do próprio ofício.
 */
function DocumentError({ error }: { error: Error }) {
	return (
		<div className="max-w-2xl mx-auto px-4 py-16 flex flex-col gap-4">
			<h1 className="text-headline text-balance">Não deu para abrir este documento</h1>
			<p className="text-sm text-muted-foreground">{error.message || "A leitura falhou. O documento continua salvo."}</p>
			<div className="flex flex-wrap gap-2">
				<Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
					Tentar de novo
				</Button>
				<Button size="sm" nativeButton={false} render={<Link to="/facilities/comunicacoes-oficiais" />}>
					Voltar aos meus documentos
				</Button>
			</div>
		</div>
	)
}

function DocumentRoute() {
	const { document, id } = Route.useLoaderData()
	// `key` no id: trocar de documento pela lista precisa remontar o editor, senão o estado
	// do documento anterior (inclusive a pilha de desfazer) atravessaria para o novo.
	return <DocumentEditor key={id} documentId={id} initialDocument={document} />
}
