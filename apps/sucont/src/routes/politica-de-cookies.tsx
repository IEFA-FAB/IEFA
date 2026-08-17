import { LegalDocumentArticle } from "@iefa/legal-kit/react"
import { createFileRoute } from "@tanstack/react-router"
import { fetchLegalDocumentFn } from "#/server/legal.fn"

export const Route = createFileRoute("/politica-de-cookies")({
	head: () => ({
		meta: [
			{ title: "Política de Cookies — SUCONT-4" },
			{ name: "description", content: "Cookies e armazenamento local — inventário, finalidade e como recusar." },
		],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "cookie_policy", locale: "pt-BR" } }),
	component: PoliticaDeCookies,
})

function PoliticaDeCookies() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-6">
			<LegalDocumentArticle document={Route.useLoaderData()} />
		</div>
	)
}
