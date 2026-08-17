import { createFileRoute } from "@tanstack/react-router"
import { LegalDocumentPage } from "@/components/LegalDocumentPage"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/_public/_en/terms-of-use")({
	head: () => ({
		meta: [
			{ title: "Terms of Use | IEFA Portal" },
			{ name: "description", content: "Conditions of access and use for the digital systems maintained by IEFA." },
		],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "terms_of_use", locale: "en-US" } }),
	component: TermsOfUse,
})

function TermsOfUse() {
	const doc = Route.useLoaderData()

	if (!doc) {
		return (
			<div className="max-w-2xl mx-auto py-8">
				<p className="text-sm text-muted-foreground">Document not found.</p>
			</div>
		)
	}

	return <LegalDocumentPage title="Terms of Use" content_md={doc.content_md} effective_date={doc.effective_date} version={doc.version} locale="en-US" />
}
