import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
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
	LEGAL_DOC_TYPES,
	LEGAL_INSTITUTIONAL_PURPOSE,
	LEGAL_RESPONSE_DAYS,
} from "@iefa/legal-kit"
import { env } from "../../env.ts"

/**
 * Documentos legais servidos pela API.
 *
 * A API não tem interface, então não há rodapé onde pendurar um link — e ela é o
 * consumidor mais provável de agente automatizado, que precisa achar o canal de
 * exercício de direitos sem renderizar HTML. Daí o índice em JSON (`/legal`) e o
 * markdown bruto por documento (`/legal/{docType}`).
 *
 * Registrado como `OpenAPIHono`, e não como Hono simples: `/llms.txt` e o
 * `/.well-known/api-catalog` são DERIVADOS de `app.getOpenAPIDocument()`. Fora do
 * registro, o endpoint existiria mas nenhum agente o encontraria — o que anula a
 * única razão de ele existir.
 */
export const legalRoutes = new OpenAPIHono()

function connection() {
	return { url: env.API_SUPABASE_URL, secretKey: env.API_SUPABASE_SERVICE_ROLE_KEY }
}

const LocaleQuerySchema = z.object({
	locale: z.enum(["pt-BR", "en-US"]).optional().openapi({ description: "Idioma do documento. Padrão: pt-BR." }),
})

const DocumentSummarySchema = z.object({
	doc_type: z.enum(LEGAL_DOC_TYPES),
	title: z.string(),
	version: z.string(),
	locale: z.string(),
	effective_date: z.string(),
	markdown_url: z.string(),
	portal_url: z.string(),
})

const LegalIndexSchema = z.object({
	controller: z.string(),
	data_protection_officer: z.string(),
	contact_email: z.string(),
	response_days: z.number(),
	institutional_purpose: z.string(),
	data_sale: z.literal(LEGAL_DATA_SALE),
	deletion: z.string(),
	documents: z.array(DocumentSummarySchema),
})

const ErrorSchema = z.object({ error: z.string(), doc_type: z.string().optional(), locale: z.string().optional() })

const indexRoute = createRoute({
	method: "get",
	path: "/",
	tags: ["Legal"],
	summary: "Documentos legais e canal de exercício de direitos (LGPD)",
	description: `Índice dos documentos legais vigentes. ${LEGAL_INSTITUTIONAL_PURPOSE["pt-BR"]} ${LEGAL_DELETION_NOTICE["pt-BR"]}`,
	request: { query: LocaleQuerySchema },
	responses: {
		200: { content: { "application/json": { schema: LegalIndexSchema } }, description: "Índice dos documentos vigentes" },
	},
})

const documentRoute = createRoute({
	method: "get",
	path: "/{docType}",
	tags: ["Legal"],
	summary: "Texto completo de um documento legal, em Markdown",
	request: {
		params: z.object({ docType: z.enum(LEGAL_DOC_TYPES) }),
		query: LocaleQuerySchema,
	},
	responses: {
		200: { content: { "text/markdown": { schema: z.string() } }, description: "Documento em Markdown" },
		404: { content: { "application/json": { schema: ErrorSchema } }, description: "Tipo desconhecido ou versão não publicada" },
	},
})

legalRoutes.openapi(indexRoute, async (c) => {
	const locale = c.req.query("locale") === "en-US" ? "en-US" : "pt-BR"
	const documents = await fetchLegalDocuments({ ...connection(), locale })

	return c.json({
		controller: LEGAL_CONTROLLER,
		data_protection_officer: LEGAL_DATA_PROTECTION_OFFICER,
		contact_email: LEGAL_CONTACT_EMAIL,
		response_days: LEGAL_RESPONSE_DAYS,
		// Explícito no índice, e não só no markdown: um agente que resolve "essa API
		// vende dados?" lendo o JSON não deveria precisar baixar a política inteira.
		// Segue o `locale` da query como os títulos e os links — devolver português a
		// quem pediu en-US entregaria, justo neste campo, algo que ele não lê.
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

// Registro só no documento, sem handler tipado: a resposta é `text/markdown`, e o
// `openapi()` espera um retorno que case com um schema JSON. `registerPath` põe a
// rota no `/doc` (e portanto no llms.txt) enquanto o handler abaixo serve o texto.
legalRoutes.openAPIRegistry.registerPath(documentRoute)

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
