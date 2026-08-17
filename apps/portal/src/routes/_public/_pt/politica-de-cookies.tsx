import { createFileRoute } from "@tanstack/react-router"
import { LegalDocumentPage } from "@/components/LegalDocumentPage"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/_public/_pt/politica-de-cookies")({
	head: () => ({
		meta: [
			{ title: "Política de Cookies | Portal IEFA" },
			{ name: "description", content: "Cookies e armazenamento local usados pelos sistemas do IEFA — inventário, finalidade e como recusar." },
		],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "cookie_policy", locale: "pt-BR" } }),
	component: PoliticaDeCookies,
})

function PoliticaDeCookies() {
	const doc = Route.useLoaderData()

	if (!doc) {
		return (
			<div className="max-w-2xl mx-auto py-8">
				<p className="text-sm text-muted-foreground">Documento não encontrado.</p>
			</div>
		)
	}

	return <LegalDocumentPage title="Política de Cookies" content_md={doc.content_md} effective_date={doc.effective_date} version={doc.version} />
}
