/**
 * Rotas admin NF-e: importação do XML (layout 4.0) para inventory.nfe_document
 * + nfe_item. Consumidor: server fns do sisub (proxy). O matching roda no
 * sisub (operation nfe-matching) — aqui só parse + persistência.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { computeNfeItemCosts } from "@iefa/sisub-domain"
import { createClient } from "@supabase/supabase-js"
import { secureCompare } from "../../lib/secure-compare.ts"
import { MAX_NFE_XML_BODY_BYTES, uploadBodyLimit } from "../../lib/upload-limit.ts"
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
		413: { content: { "application/json": { schema: ErrorSchema } }, description: "Corpo acima do limite" },
	},
})

type ParsedNfe = ReturnType<typeof parseNfeXml>

function buildItemRows(documentId: string, parsed: ParsedNfe, costByItem: Map<number, number>) {
	return parsed.items.map((item) => ({
		nfe_document_id: documentId,
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
		taxable_unit: item.taxableUnit,
		taxable_qty: item.taxableQty,
		product_value: item.productValue,
		discount_value: item.discount,
		freight_value: item.freight,
		insurance_value: item.insurance,
		other_expenses_value: item.otherExpenses,
		ipi_value: item.ipi,
		icms_st_value: item.icmsSt,
		fcp_st_value: item.fcpSt,
		acquisition_cost: costByItem.get(item.nItem) ?? null,
		lot_code: item.lotCode,
		lot_qty: item.lotQty,
		mfg_date: item.mfgDate,
		expiry_date: item.expiryDate,
	}))
}

/**
 * Completa a nota anunciada pela chave do DANFE com o XML: itens primeiro, documento depois.
 * Se os itens falham, nada mudou; se o documento falha, os itens inseridos saem — a nota
 * continua anunciada, como estava.
 */
async function completeAnnouncedDocument(
	supabase: NfeClient,
	existing: { id: string; kitchen_id: number | null; unit_id: number | null },
	fields: Record<string, unknown>,
	parsed: ParsedNfe,
	costByItem: Map<number, number>
): Promise<{ itemsCount: number; unitId: number | null } | { error: string; conflict?: boolean }> {
	const itemRows = buildItemRows(existing.id, parsed, costByItem)
	// Nota ainda anunciada não tem item legítimo: sobra de um completamento que morreu entre o
	// insert dos itens e o update do documento. Sem limpar, todo reenvio batia no único
	// (nfe_document_id, n_item) e devolvia 500 para sempre.
	const { error: cleanupError } = await supabase.from("nfe_item").delete().eq("nfe_document_id", existing.id)
	if (cleanupError) return { error: `Falha ao limpar itens de completamento anterior: ${cleanupError.message}` }
	const { error: itemsError } = await supabase.from("nfe_item").insert(itemRows)
	if (itemsError) return { error: `Falha ao gravar nfe_item: ${itemsError.message}` }

	// Destinatário do XML vence o palpite da chave (a unidade de compra da cozinha que leu);
	// sem destinatário conhecido, fica o que a leitura da chave registrou.
	const unitId = (fields.unit_id as number | null) ?? existing.unit_id
	const { data: completed, error: docError } = await supabase
		.from("nfe_document")
		.update({
			...fields,
			access_key: undefined,
			unit_id: unitId,
			destination_confirmed: fields.unit_id != null,
			kitchen_id: existing.kitchen_id ?? fields.kitchen_id,
			created_by: undefined,
		})
		.eq("id", existing.id)
		.eq("status", "announced")
		.select("id")
	// Zero linhas = a nota deixou de estar anunciada entre a leitura e agora (cancelada,
	// completada por outro envio). Os itens recém-gravados não pertencem a ela.
	if (docError || !completed || completed.length === 0) {
		await supabase.from("nfe_item").delete().eq("nfe_document_id", existing.id)
		if (docError) return { error: `Falha ao completar nfe_document: ${docError.message}` }
		return { error: "A nota mudou de situação durante a importação — recarregue e confira", conflict: true }
	}
	return { itemsCount: itemRows.length, unitId }
}

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
	// Depois do segredo, nunca antes: ver `upload-limit.ts`.
	nfeAdminRoutes.use("/import", uploadBodyLimit(MAX_NFE_XML_BODY_BYTES))

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

		// Autenticidade ANTES de valor: esta nota vira custo de lote e lastro de
		// liquidação. O comentário antigo do parser dizia "XML autorizado" e nada
		// conferia — `<cStat>100</cStat>` digitado à mão passava.
		const auth = parsed.authenticity
		if (auth.problems.length > 0) {
			return c.json({ error: `NF-e recusada: ${auth.problems.join("; ")}`, authenticity: auth }, 422)
		}

		const supabase = createSupabase()

		// Destinatário → unidade. Nota de outra unidade não é erro: ela é gravada
		// no lugar certo, e a cozinha que importou fica sabendo para onde foi.
		const destTaxId = parsed.destCnpj ?? parsed.destCpf
		let unitId: number | null = null
		if (destTaxId) {
			const { data: unit } = await supabase.from("units").select("id").eq("cnpj", destTaxId).maybeSingle()
			unitId = unit ? Number(unit.id) : null
		}

		const costs = computeNfeItemCosts(
			parsed.items.map((item) => ({
				nItem: item.nItem,
				productValue: item.productValue ?? (item.commercialQty ?? 0) * (item.unitPrice ?? 0),
				discount: item.discount,
				freight: item.freight,
				insurance: item.insurance,
				otherExpenses: item.otherExpenses,
				ipi: item.ipi,
				icmsSt: item.icmsSt,
				fcpSt: item.fcpSt,
			})),
			parsed.totalValue
		)
		const costByItem = new Map(costs.items.map((item) => [item.nItem, item.totalCost]))

		const documentFields = {
			access_key: parsed.accessKey,
			supplier_cnpj: parsed.supplierCnpj,
			supplier_cpf: parsed.supplierCpf,
			supplier_name: parsed.supplierName,
			dest_cnpj: parsed.destCnpj,
			dest_cpf: parsed.destCpf,
			unit_id: unitId,
			destination_confirmed: unitId != null,
			issued_at: parsed.issuedAt,
			total_value: parsed.totalValue,
			purpose: parsed.purpose,
			referenced_keys: parsed.referencedKeys,
			protocol_number: auth.protocolNumber,
			authenticity: auth,
			status: "available",
			xml,
			kitchen_id: kitchen_id ?? null,
			created_by: created_by ?? null,
		}

		const { data: doc, error: docError } = await supabase.from("nfe_document").insert(documentFields).select("id").single()

		if (docError) {
			if (docError.code === "23505") {
				const { data: existing } = await supabase
					.from("nfe_document")
					.select("id, status, kitchen_id, unit_id")
					.eq("access_key", parsed.accessKey)
					.maybeSingle()
				// Nota ANUNCIADA pela chave do DANFE: o XML é o que a completa — é o fluxo que a tela
				// promete ("o XML completa os itens quando chegar"). Antes ela caía na auto-cura
				// abaixo: sem itens, era apagada e o usuário lia "envie de novo"; e como
				// `goods_receipt` e `finance.liquidacao` apontam para ela com ON DELETE SET NULL, o
				// recebimento já registrado pela chave perdia a nota em silêncio.
				if (existing?.status === "announced") {
					if (existing.kitchen_id != null && kitchen_id != null && Number(existing.kitchen_id) !== kitchen_id) {
						return c.json({ error: "NF-e já pertence a outra cozinha", document_id: undefined }, 409)
					}
					const completed = await completeAnnouncedDocument(supabase, existing, documentFields, parsed, costByItem)
					if ("error" in completed) {
						if (completed.conflict) return c.json({ error: completed.error, document_id: undefined }, 409)
						throw new Error(completed.error)
					}
					console.log(`[nfe-admin] NF-e ${parsed.accessKey} anunciada pela chave completada pelo XML: ${completed.itemsCount} itens`)
					return c.json(
						{
							document_id: existing.id as string,
							access_key: parsed.accessKey,
							items_count: completed.itemsCount,
							unit_id: completed.unitId,
							invoice_difference: costs.invoiceDifference,
						},
						201
					)
				}
				// Auto-cura: um import anterior que morreu entre documento e itens
				// deixa um doc SEM itens reservando a chave — remove e reimporta,
				// em vez de devolver 409 para sempre (review: cleanup non-atomic).
				// Só se nada aponta para ele: o SET NULL das FKs desvincularia o recebimento.
				if (existing) {
					const { count } = await supabase.from("nfe_item").select("id", { count: "exact", head: true }).eq("nfe_document_id", existing.id)
					const { count: receipts } = await supabase.from("goods_receipt").select("id", { count: "exact", head: true }).eq("nfe_document_id", existing.id)
					if ((count ?? 0) === 0 && (receipts ?? 0) === 0) {
						await supabase.from("nfe_document").delete().eq("id", existing.id)
						console.warn(`[nfe-admin] Documento órfão (sem itens) removido para reimport: ${parsed.accessKey}`)
						return c.json({ error: "Import anterior incompleto foi removido — envie o XML novamente", document_id: undefined }, 409)
					}
				}
				return c.json({ error: "NF-e já importada (chave de acesso duplicada)", document_id: existing?.id }, 409)
			}
			throw new Error(`Falha ao gravar nfe_document: ${docError.message}`)
		}

		const itemRows = buildItemRows(doc.id as string, parsed, costByItem)

		const { error: itemsError } = await supabase.from("nfe_item").insert(itemRows)
		if (itemsError) {
			// rollback manual: sem os itens o documento é inútil e a chave ficaria travada
			await supabase.from("nfe_document").delete().eq("id", doc.id)
			throw new Error(`Falha ao gravar nfe_item: ${itemsError.message}`)
		}

		console.log(`[nfe-admin] NF-e ${parsed.accessKey} importada: ${itemRows.length} itens`)
		return c.json(
			{
				document_id: doc.id as string,
				access_key: parsed.accessKey,
				items_count: itemRows.length,
				unit_id: unitId,
				// diferença entre a soma dos itens e o vNF: dado da nota para o
				// operador conferir, nunca "corrigido" em silêncio
				invoice_difference: costs.invoiceDifference,
			},
			201
		)
	})

	return nfeAdminRoutes
}

export const nfeAdminRoutes = createNfeAdminRoutes()
