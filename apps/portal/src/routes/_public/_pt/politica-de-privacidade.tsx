import { createFileRoute } from "@tanstack/react-router"
import { LegalDocumentPage } from "@/components/LegalDocumentPage"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/_public/_pt/politica-de-privacidade")({
	head: () => ({
		meta: [
			{ title: "Política de Privacidade | Portal IEFA" },
			{ name: "description", content: "Política de privacidade dos sistemas digitais do IEFA — dados coletados, finalidade e direitos do usuário." },
		],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "privacy_policy", locale: "pt-BR" } }),
	component: PoliticaDePrivacidade,
})

function PoliticaDePrivacidade() {
	const doc = Route.useLoaderData()

	if (!doc) {
		return (
			<div className="max-w-2xl mx-auto py-8">
				<p className="text-sm text-muted-foreground">Documento não encontrado.</p>
			</div>
		)
	}

	return <LegalDocumentPage title="Política de Privacidade" content_md={doc.content_md} effective_date={doc.effective_date} version={doc.version} />
}
