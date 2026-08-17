import { createFileRoute } from "@tanstack/react-router"
import { LegalDocumentPage } from "@/components/ui/legal-markdown"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/_public/politica-de-cookies")({
	loader: () => fetchLegalDocumentFn({ data: { docType: "cookie_policy", locale: "pt-BR" } }),
	head: () => {
		const baseUrl = import.meta.env.VITE_PUBLIC_URL ?? ""
		const title = "Política de Cookies — SISUB"
		const description = "Cookies e armazenamento local usados pelo SISUB — inventário, finalidade e como recusar."
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:url", content: `${baseUrl}/politica-de-cookies` },
				{ name: "twitter:title", content: title },
				{ name: "twitter:description", content: description },
				{ name: "twitter:url", content: `${baseUrl}/politica-de-cookies` },
			],
		}
	},
	component: PoliticaDeCookies,
})

function PoliticaDeCookies() {
	const doc = Route.useLoaderData()

	if (!doc) {
		return <p className="text-sm text-muted-foreground py-8">Documento não encontrado.</p>
	}

	return <LegalDocumentPage title="Política de Cookies" content_md={doc.content_md} effective_date={doc.effective_date} version={doc.version} />
}
