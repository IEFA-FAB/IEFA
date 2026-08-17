import { createFileRoute } from "@tanstack/react-router"
import { LegalDocumentPage } from "@/components/LegalDocumentPage"
import { fetchLegalDocumentFn } from "@/server/legal.fn"

export const Route = createFileRoute("/_public/_en/privacy-policy")({
	head: () => ({
		meta: [
			{ title: "Privacy Policy | IEFA Portal" },
			{ name: "description", content: "How IEFA digital systems process personal data — collection, purposes, retention and how to exercise your rights." },
		],
	}),
	loader: () => fetchLegalDocumentFn({ data: { docType: "privacy_policy", locale: "en-US" } }),
	component: PrivacyPolicy,
})

function PrivacyPolicy() {
	const doc = Route.useLoaderData()

	if (!doc) {
		return (
			<div className="max-w-2xl mx-auto py-8">
				<p className="text-sm text-muted-foreground">Document not found.</p>
			</div>
		)
	}

	return <LegalDocumentPage title="Privacy Policy" content_md={doc.content_md} effective_date={doc.effective_date} version={doc.version} locale="en-US" />
}
