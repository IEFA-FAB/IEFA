/**
 * @module legal.fn
 * Reader for published legal documents (terms, privacy, etc.) from the iefa schema by doc_type/version/locale.
 * @domain external
 * @migration n-a
 */

import type { Database } from "@iefa/database"
import { createClient } from "@supabase/supabase-js"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { envServer } from "@/lib/env.server"

function getIefaSchemaClient() {
	return createClient<Database, "iefa">(envServer.VITE_SISUB_SUPABASE_URL, envServer.SISUB_SUPABASE_SECRET_KEY, {
		db: { schema: "iefa" },
		auth: { persistSession: false },
	})
}

export type LegalDocument = {
	id: string | null
	doc_type: string | null
	version: string | null
	locale: string | null
	content_md: string | null
	effective_date: string | null
	published_at: string | null
}

export const fetchLegalDocumentFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			docType: z.enum(["terms_of_use", "privacy_policy"]),
			locale: z.string().default("pt-BR"),
		})
	)
	.handler(async ({ data }) => {
		const { data: doc, error } = await getIefaSchemaClient()
			.from("legal_documents_current")
			.select("id, doc_type, version, locale, content_md, effective_date, published_at")
			.eq("doc_type", data.docType)
			.eq("locale", data.locale)
			.maybeSingle()

		if (error) throw new Error(error.message)
		return doc
	})
