import { LegalDocumentArticle } from "@iefa/legal-kit/react"
import { createFileRoute } from "@tanstack/react-router"
import { fetchLegalDocumentFn } from "#/server/legal.fn"

export const Route = createFileRoute("/politica-de-privacidade")({
	head: () => ({
		meta: [
			{ title: "Política de Privacidade — SUCONT-4" },
			{ name: "description", content: "Dados coletados, finalidade, retenção e como exercer seus direitos." },
		],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "privacy_policy", locale: "pt-BR" } }),
	component: PoliticaDePrivacidade,
})

function PoliticaDePrivacidade() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-6">
			<LegalDocumentArticle document={Route.useLoaderData()} />
		</div>
	)
}
