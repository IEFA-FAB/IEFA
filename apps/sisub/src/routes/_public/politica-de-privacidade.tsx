import { createFileRoute } from "@tanstack/react-router"
import { LegalDocumentPage } from "@/components/ui/legal-markdown"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/_public/politica-de-privacidade")({
	head: () => ({
		meta: [
			{ title: "Política de Privacidade — SISUB" },
			{ name: "description", content: "Política de privacidade do SISUB — dados coletados, finalidade e direitos do usuário." },
		],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "privacy_policy", locale: "pt-BR" } }),
	component: PoliticaDePrivacidade,
})

function PoliticaDePrivacidade() {
	const doc = Route.useLoaderData()

	if (!doc) {
		return <p className="text-sm text-muted-foreground py-8">Documento não encontrado.</p>
	}

	return (
		<LegalDocumentPage
			title="Política de Privacidade"
			content_md={doc.content_md ?? ""}
			effective_date={doc.effective_date ?? ""}
			version={doc.version ?? ""}
		/>
	)
}
