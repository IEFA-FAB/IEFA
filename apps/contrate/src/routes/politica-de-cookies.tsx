import { createFileRoute } from "@tanstack/react-router"
import { AppLayout } from "@/components/AppLayout"
import { LegalDocumentPage } from "@/components/LegalDocumentPage"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/politica-de-cookies")({
	head: () => ({
		meta: [
			{ title: "Política de Cookies | Contrate" },
			{ name: "description", content: "Cookies e armazenamento local usados pelos sistemas do IEFA — inventário, finalidade e como recusar." },
		],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "cookie_policy", locale: "pt-BR" } }),
	component: CookiePolicy,
})

function CookiePolicy() {
	const doc = Route.useLoaderData()

	return (
		<AppLayout>
			{doc ? (
				<LegalDocumentPage title="Política de Cookies" content_md={doc.content_md} effective_date={doc.effective_date} version={doc.version} locale="pt-BR" />
			) : (
				<div className="max-w-2xl mx-auto py-8">
					<p className="text-sm text-muted-foreground">Documento não encontrado.</p>
				</div>
			)}
		</AppLayout>
	)
}
