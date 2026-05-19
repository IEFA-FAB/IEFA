import { createFileRoute } from "@tanstack/react-router"
import { LegalDocumentPage } from "@/components/LegalDocumentPage"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/_public/_pt/termos-de-uso")({
	head: () => ({
		meta: [
			{ title: "Termos de Uso | Portal IEFA" },
			{ name: "description", content: "Termos de uso dos sistemas digitais do IEFA — condições de acesso e uso da plataforma." },
		],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "terms_of_use", locale: "pt-BR" } }),
	component: TermosDeUso,
})

function TermosDeUso() {
	const doc = Route.useLoaderData()

	if (!doc) {
		return (
			<div className="max-w-2xl mx-auto py-8">
				<p className="text-sm text-muted-foreground">Documento não encontrado.</p>
			</div>
		)
	}

	return <LegalDocumentPage title="Termos de Uso" content_md={doc.content_md} effective_date={doc.effective_date} version={doc.version} />
}
