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
import { env } from "../../env.ts"

/**
 * Documentos legais servidos pela API.
 *
 * A API não tem interface, então não há rodapé onde pendurar um link — e ela é o
 * consumidor mais provável de agente automatizado, que precisa achar o canal de
 * exercício de direitos sem renderizar HTML. Daí o índice em JSON (`/legal`) e o
 * markdown bruto por documento (`/legal/:docType`).
 *
 * Fora da cadeia tipada do RPC de propósito: são rotas de conteúdo, e incluí-las
 * no `typedApp` inflaria o tipo exportado para os clients sem ganho nenhum.
 */
export const legalRoutes = new Hono()

function connection() {
	return { url: env.API_SUPABASE_URL, secretKey: env.API_SUPABASE_SERVICE_ROLE_KEY }
}

legalRoutes.get("/", async (c) => {
	const locale = c.req.query("locale") ?? "pt-BR"
	const documents = await fetchLegalDocuments({ ...connection(), locale })

	return c.json({
		controller: "Instituto de Economia, Finanças e Administração da Aeronáutica (IEFA)",
		data_protection_officer: "Secretaria do IEFA",
		contact_email: LEGAL_CONTACT_EMAIL,
		response_days: LEGAL_RESPONSE_DAYS,
		deletion: `Não há autoexclusão. Pedidos de acesso, correção ou eliminação são processados manualmente pela Secretaria do IEFA, por e-mail para ${LEGAL_CONTACT_EMAIL}, com resposta em até ${LEGAL_RESPONSE_DAYS} dias corridos.`,
		documents: documents.map((doc) => ({
			doc_type: doc.doc_type,
			title: LEGAL_DOC_TITLES[locale === "en-US" ? "en-US" : "pt-BR"][doc.doc_type],
			version: doc.version,
			locale: doc.locale,
			effective_date: doc.effective_date,
			markdown_url: `/legal/${doc.doc_type}?locale=${doc.locale}`,
			portal_url: `https://portal.iefa.com.br${LEGAL_DOC_PATHS[locale === "en-US" ? "en-US" : "pt-BR"][doc.doc_type]}`,
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
