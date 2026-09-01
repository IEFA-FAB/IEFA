/**
 * Rotas admin NF-e: importação do XML (layout 4.0) para inventory.nfe_document
 * + nfe_item. Consumidor: server fns do sisub (proxy). O matching roda no
 * sisub (operation nfe-matching) — aqui só parse + persistência.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { createClient } from "@supabase/supabase-js"
import { secureCompare } from "../../lib/secure-compare.ts"
import { NfeParseError, parseNfeXml } from "../../workers/nfe/parse.ts"

type NfeClient = ReturnType<typeof getSupabase>

function requiredEnv(name: "API_SUPABASE_URL" | "API_SUPABASE_SERVICE_ROLE_KEY") {
	const value = process.env[name]
	if (!value) throw new Error(`${name} is required`)
	return value
}

function getSupabase() {
	return createClient(requiredEnv("API_SUPABASE_URL"), requiredEnv("API_SUPABASE_SERVICE_ROLE_KEY"), {
		db: { schema: "inventory" },
		auth: { persistSession: false },
	})
}

const ErrorSchema = z.object({ error: z.string() })

const ImportResultSchema = z.object({
	document_id: z.string(),
	access_key: z.string(),
	items_count: z.number(),
})

const importRoute = createRoute({
	method: "post",
	path: "/import",
	tags: ["Admin — NF-e"],
	summary: "Import NF-e XML",
	description: "Recebe o XML da NF-e (body texto), valida, persiste documento + itens (match_status pending). Duplicata de chave de acesso → 409.",
	security: [{ AdminSecret: [] }],
	request: {
		body: {
			content: { "application/xml": { schema: z.string() }, "text/plain": { schema: z.string() } },
			required: true,
		},
		query: z.object({
			kitchen_id: z.coerce.number().int().positive().optional(),
			created_by: z.uuid().optional(),
		}),
	},
	responses: {
		201: { content: { "application/json": { schema: ImportResultSchema } }, description: "Documento importado" },
		409: {
			content: { "application/json": { schema: ErrorSchema.extend({ document_id: z.string().optional() }) } },
			description: "Chave de acesso já importada",
		},
		422: { content: { "application/json": { schema: ErrorSchema } }, description: "XML inválido" },
		401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
	},
})

export interface NfeAdminRoutesDeps {
	adminSecret?: string
	getSupabase?: () => NfeClient
}

export function createNfeAdminRoutes(deps: NfeAdminRoutesDeps = {}) {
	const nfeAdminRoutes = new OpenAPIHono()
	const adminSecret = deps.adminSecret ?? process.env.ADMIN_SECRET
	const createSupabase = deps.getSupabase ?? getSupabase

	nfeAdminRoutes.use("*", async (c, next) => {
		const secret = c.req.header("x-admin-secret")
		if (!secureCompare(secret, adminSecret)) return c.json({ error: "Unauthorized" }, 401)
		return next()
	})

	nfeAdminRoutes.openapi(importRoute, async (c) => {
		const xml = await c.req.text()
		const { kitchen_id, created_by } = c.req.valid("query")

		let parsed: ReturnType<typeof parseNfeXml>
		try {
			parsed = parseNfeXml(xml)
		} catch (err) {
			if (err instanceof NfeParseError) return c.json({ error: err.message }, 422)
			throw err
		}

		const supabase = createSupabase()

		const { data: doc, error: docError } = await supabase
			.from("nfe_document")
			.insert({
				access_key: parsed.accessKey,
				supplier_cnpj: parsed.supplierCnpj,
				supplier_name: parsed.supplierName,
				dest_cnpj: parsed.destCnpj,
				issued_at: parsed.issuedAt,
				total_value: parsed.totalValue,
				xml,
				kitchen_id: kitchen_id ?? null,
				created_by: created_by ?? null,
			})
			.select("id")
			.single()

		if (docError) {
			if (docError.code === "23505") {
				const { data: existing } = await supabase.from("nfe_document").select("id").eq("access_key", parsed.accessKey).maybeSingle()
				// Auto-cura: um import anterior que morreu entre documento e itens
				// deixa um doc SEM itens reservando a chave — remove e reimporta,
				// em vez de devolver 409 para sempre (review: cleanup non-atomic).
				if (existing) {
					const { count } = await supabase.from("nfe_item").select("id", { count: "exact", head: true }).eq("nfe_document_id", existing.id)
					if ((count ?? 0) === 0) {
						await supabase.from("nfe_document").delete().eq("id", existing.id)
						console.warn(`[nfe-admin] Documento órfão (sem itens) removido para reimport: ${parsed.accessKey}`)
						return c.json({ error: "Import anterior incompleto foi removido — envie o XML novamente", document_id: undefined }, 409)
					}
				}
				return c.json({ error: "NF-e já importada (chave de acesso duplicada)", document_id: existing?.id }, 409)
			}
			throw new Error(`Falha ao gravar nfe_document: ${docError.message}`)
		}

		const itemRows = parsed.items.map((item) => ({
			nfe_document_id: doc.id,
			n_item: item.nItem,
			supplier_code: item.supplierCode,
			description: item.description,
			gtin: item.gtin,
			gtin_trib: item.gtinTrib,
			ncm: item.ncm,
			cest: item.cest,
			cfop: item.cfop,
			commercial_unit: item.commercialUnit,
			commercial_qty: item.commercialQty,
			unit_price: item.unitPrice,
			lot_code: item.lotCode,
			lot_qty: item.lotQty,
			mfg_date: item.mfgDate,
			expiry_date: item.expiryDate,
		}))

		const { error: itemsError } = await supabase.from("nfe_item").insert(itemRows)
		if (itemsError) {
			// rollback manual: sem os itens o documento é inútil e a chave ficaria travada
			await supabase.from("nfe_document").delete().eq("id", doc.id)
			throw new Error(`Falha ao gravar nfe_item: ${itemsError.message}`)
		}

		console.log(`[nfe-admin] NF-e ${parsed.accessKey} importada: ${itemRows.length} itens`)
		return c.json({ document_id: doc.id as string, access_key: parsed.accessKey, items_count: itemRows.length }, 201)
	})

	return nfeAdminRoutes
}

export const nfeAdminRoutes = createNfeAdminRoutes()
