import { createClient } from "@supabase/supabase-js"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { envServer } from "@/lib/env.server"

function getIefaServerClient() {
	return createClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, {
		db: { schema: "iefa" },
		auth: { persistSession: false },
	})
}

export type LegalDocument = {
	id: string
	doc_type: string
	version: string
	locale: string
	content_md: string
	effective_date: string
	published_at: string | null
}

// Público por contrato: termos de uso / política de privacidade.
// nosemgrep: server-fn-missing-auth-guard
export const fetchLegalDocumentFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			docType: z.enum(["terms_of_use", "privacy_policy"]),
			locale: z.string().default("pt-BR"),
		})
	)
	.handler(async ({ data }) => {
		const { data: doc, error } = await getIefaServerClient()
			.from("legal_documents_current")
			.select("id, doc_type, version, locale, content_md, effective_date, published_at")
			.eq("doc_type", data.docType)
			.eq("locale", data.locale)
			.maybeSingle()

		if (error) throw new Error(error.message)
		if (!doc) return null

		const row = doc as Record<string, string | null>
		return {
			id: row.id ?? "",
			doc_type: row.doc_type ?? "",
			version: row.version ?? "",
			locale: row.locale ?? "",
			content_md: row.content_md ?? "",
			effective_date: row.effective_date ?? "",
			published_at: row.published_at ?? null,
		} satisfies LegalDocument
	})
