import { createFileRoute } from "@tanstack/react-router"
import { AppLayout } from "@/components/AppLayout"
import { LegalDocumentPage } from "@/components/LegalDocumentPage"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/politica-de-privacidade")({
	head: () => ({
		meta: [{ title: "Política de Privacidade | Contrate" }, { name: "description", content: "Tratamento de dados pessoais conforme a LGPD." }],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "privacy_policy", locale: "pt-BR" } }),
	component: PrivacyPolicy,
})

function PrivacyPolicy() {
	const doc = Route.useLoaderData()

	return (
		<AppLayout>
			{doc ? (
				<LegalDocumentPage
					title="Política de Privacidade"
					content_md={doc.content_md}
					effective_date={doc.effective_date}
					version={doc.version}
					locale="pt-BR"
				/>
			) : (
				<div className="max-w-2xl mx-auto py-8">
					<p className="text-sm text-muted-foreground">Documento não encontrado.</p>
				</div>
			)}
		</AppLayout>
	)
}
