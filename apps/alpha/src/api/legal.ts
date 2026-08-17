import {
	fetchLegalDocument,
	fetchLegalDocuments,
	isLegalDocType,
	LEGAL_CONTACT_EMAIL,
	LEGAL_CONTROLLER,
	LEGAL_DATA_PROTECTION_OFFICER,
	LEGAL_DATA_SALE,
	LEGAL_DELETION_NOTICE,
	LEGAL_DOC_PATHS,
	LEGAL_DOC_TITLES,
	LEGAL_INSTITUTIONAL_PURPOSE,
	LEGAL_RESPONSE_DAYS,
} from "@iefa/legal-kit"
import { Hono } from "hono"
import { env } from "../env.ts"

/**
 * Documentos legais servidos pelo alpha.
 *
 * O alpha não tem interface própria — é consumido por agente e pelo portal — e é
 * o serviço que mais trata conteúdo de conversa com modelo de linguagem. O canal
 * de exercício de direitos tem que ser alcançável a partir dele sem depender de
 * quem o embute.
 */
export const legalRoutes = new Hono()

function connection() {
	return { url: env.SUPABASE_URL, secretKey: env.SUPABASE_SERVICE_ROLE_KEY }
}

legalRoutes.get("/", async (c) => {
	const locale = c.req.query("locale") === "en-US" ? "en-US" : "pt-BR"
	const documents = await fetchLegalDocuments({ ...connection(), locale })

	return c.json({
		controller: LEGAL_CONTROLLER,
		data_protection_officer: LEGAL_DATA_PROTECTION_OFFICER,
		contact_email: LEGAL_CONTACT_EMAIL,
		response_days: LEGAL_RESPONSE_DAYS,
		// Explícito no índice, e não só no markdown: um agente que resolve "essa API
		// vende dados?" lendo o JSON não deveria precisar baixar a política inteira.
		// Segue o `locale` da query como os títulos e os links.
		institutional_purpose: LEGAL_INSTITUTIONAL_PURPOSE[locale],
		data_sale: LEGAL_DATA_SALE,
		deletion: LEGAL_DELETION_NOTICE[locale],
		documents: documents.map((doc) => ({
			doc_type: doc.doc_type,
			title: LEGAL_DOC_TITLES[locale][doc.doc_type],
			version: doc.version,
			locale: doc.locale,
			effective_date: doc.effective_date,
			markdown_url: `/legal/${doc.doc_type}?locale=${doc.locale}`,
			portal_url: `https://portal.iefa.com.br${LEGAL_DOC_PATHS[locale][doc.doc_type]}`,
		})),
	})
})

legalRoutes.get("/:docType", async (c) => {
	const docType = c.req.param("docType")
	if (!isLegalDocType(docType)) return c.json({ error: "unknown_doc_type", doc_type: docType }, 404)

	const locale = c.req.query("locale") ?? "pt-BR"
	const document = await fetchLegalDocument({ ...connection(), docType, locale })
	if (!document) return c.json({ error: "not_published", doc_type: docType, locale }, 404)

	return c.text(document.content_md, 200, {
		"Content-Type": "text/markdown; charset=utf-8",
		"X-Legal-Version": document.version,
		"X-Legal-Effective-Date": document.effective_date,
	})
})
