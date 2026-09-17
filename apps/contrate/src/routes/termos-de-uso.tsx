import { createFileRoute } from "@tanstack/react-router"
import { AppLayout } from "@/components/AppLayout"
import { LegalDocumentPage } from "@/components/LegalDocumentPage"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/termos-de-uso")({
	head: () => ({
		meta: [{ title: "Termos de Uso | Contrate" }, { name: "description", content: "Condições de acesso e uso dos sistemas digitais mantidos pelo IEFA." }],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "terms_of_use", locale: "pt-BR" } }),
	component: TermsOfUse,
})

function TermsOfUse() {
	const doc = Route.useLoaderData()

	return (
		<AppLayout>
			{doc ? (
				<LegalDocumentPage title="Termos de Uso" content_md={doc.content_md} effective_date={doc.effective_date} version={doc.version} locale="pt-BR" />
			) : (
				<div className="max-w-2xl mx-auto py-8">
					<p className="text-sm text-muted-foreground">Documento não encontrado.</p>
				</div>
			)}
		</AppLayout>
	)
}
