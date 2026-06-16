import { createFileRoute } from "@tanstack/react-router"
import { LegalDocumentPage } from "@/components/ui/legal-markdown"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/_public/politica-de-privacidade")({
	loader: () => fetchLegalDocumentFn({ data: { docType: "privacy_policy", locale: "pt-BR" } }),
	head: () => {
		const baseUrl = import.meta.env.VITE_PUBLIC_URL ?? ""
		const title = "Política de Privacidade — SISUB"
		const description = "Política de privacidade do SISUB — dados coletados, finalidade e direitos do usuário."
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:url", content: `${baseUrl}/politica-de-privacidade` },
				{ name: "twitter:title", content: title },
				{ name: "twitter:description", content: description },
				{ name: "twitter:url", content: `${baseUrl}/politica-de-privacidade` },
			],
		}
	},
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
