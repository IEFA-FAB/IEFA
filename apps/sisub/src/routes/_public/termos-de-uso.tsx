import { createFileRoute } from "@tanstack/react-router"
import { LegalDocumentPage } from "@/components/ui/legal-markdown"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/_public/termos-de-uso")({
	head: () => ({
		meta: [{ title: "Termos de Uso — SISUB" }, { name: "description", content: "Termos de uso do SISUB — condições de acesso e uso da plataforma." }],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "terms_of_use", locale: "pt-BR" } }),
	component: TermosDeUso,
})

function TermosDeUso() {
	const doc = Route.useLoaderData()

	if (!doc) {
		return <p className="text-sm text-muted-foreground py-8">Documento não encontrado.</p>
	}

	return <LegalDocumentPage title="Termos de Uso" content_md={doc.content_md ?? ""} effective_date={doc.effective_date ?? ""} version={doc.version ?? ""} />
}
