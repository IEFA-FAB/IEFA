import { createFileRoute } from "@tanstack/react-router"
import { LegalDocumentPage } from "@/components/LegalDocumentPage"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/_public/_en/cookie-policy")({
	head: () => ({
		meta: [
			{ title: "Cookie Policy | IEFA Portal" },
			{ name: "description", content: "Cookies and browser storage used by IEFA systems — inventory, purpose and how to refuse them." },
		],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "cookie_policy", locale: "en-US" } }),
	component: CookiePolicy,
})

function CookiePolicy() {
	const doc = Route.useLoaderData()

	if (!doc) {
		return (
			<div className="max-w-2xl mx-auto py-8">
				<p className="text-sm text-muted-foreground">Document not found.</p>
			</div>
		)
	}

	return <LegalDocumentPage title="Cookie Policy" content_md={doc.content_md} effective_date={doc.effective_date} version={doc.version} locale="en-US" />
}
