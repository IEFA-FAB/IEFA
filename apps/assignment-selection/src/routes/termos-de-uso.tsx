import { LegalDocumentArticle } from "@iefa/legal-kit/react"
import { createFileRoute } from "@tanstack/react-router"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/termos-de-uso")({
	head: () => ({
		meta: [{ title: "Termos de Uso — Escolha de Vagas" }, { name: "description", content: "Condições de acesso e uso da plataforma." }],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "terms_of_use", locale: "pt-BR" } }),
	component: TermosDeUso,
})

function TermosDeUso() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-6">
			<LegalDocumentArticle document={Route.useLoaderData()} />
		</div>
	)
}
