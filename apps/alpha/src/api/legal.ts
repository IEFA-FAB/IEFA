import {
	fetchLegalDocument,
	fetchLegalDocuments,
	isLegalDocType,
	LEGAL_CONTACT_EMAIL,
	LEGAL_DOC_PATHS,
	LEGAL_DOC_TITLES,
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
		controller: "Instituto de Economia, Finanças e Administração da Aeronáutica (IEFA)",
		data_protection_officer: "Secretaria do IEFA",
		contact_email: LEGAL_CONTACT_EMAIL,
		response_days: LEGAL_RESPONSE_DAYS,
		deletion: `Não há autoexclusão. Pedidos de acesso, correção ou eliminação são processados manualmente pela Secretaria do IEFA, por e-mail para ${LEGAL_CONTACT_EMAIL}, com resposta em até ${LEGAL_RESPONSE_DAYS} dias corridos.`,
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
