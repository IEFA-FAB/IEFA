/**
 * Rotas admin NF-e: importação do XML (layout 4.0) para inventory.nfe_document
 * + nfe_item. Consumidor: server fns do sisub (proxy). O matching roda no
 * sisub (operation nfe-matching) — aqui só parse + persistência.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { computeNfeItemCosts, resolvePurchaseUnitId } from "@iefa/sisub-domain"
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
	unit_id: z.number().nullable().optional(),
	/** Nulo quando a cozinha pedida não é da unidade destinatária: a nota foi para a triagem dela. */
	kitchen_id: z.number().nullable().optional(),
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

/**
 * Com que cozinha a nota fica.
 *
 * A cozinha que enviou o XML só fica com a nota quando o destinatário é a unidade de compra
 * dela. Destinatário reconhecido e de OUTRA unidade: a nota é gravada sem cozinha, na triagem da
 * unidade certa (as cozinhas de lá a assumem). Antes, a cozinha que enviou ficava com a nota de
 * outra OM e podia receber e liquidar a mercadoria por ela.
 *
 * Recusar seria pior: a nota é verdadeira e já está no mundo; recusar a deixaria sem registro, e
 * a unidade destinatária teria de esperar alguém reenviar. Destinatário NÃO reconhecido (CNPJ
 * fora do cadastro de unidades) mantém a cozinha: não há outra unidade para quem mandar, e a
 * nota fica com `destination_confirmed = false`.
 */
export function kitchenForImportedNfe(input: {
	requestedKitchenId: number | null
	destinationUnitId: number | null
	kitchenPurchaseUnitId: number | null
}): number | null {
	if (input.requestedKitchenId == null) return null
	if (input.destinationUnitId == null) return input.requestedKitchenId
	return input.kitchenPurchaseUnitId === input.destinationUnitId ? input.requestedKitchenId : null
}

/** Unidade de compra da cozinha: `purchase_unit_id`, senão `unit_id` — é o CNPJ dela que vem na nota. */
async function purchaseUnitOfKitchen(supabase: NfeClient, kitchenId: number | null): Promise<number | null> {
	if (kitchenId == null) return null
	const { data, error } = await supabase.schema("kitchen").from("kitchen").select("unit_id, purchase_unit_id").eq("id", kitchenId).maybeSingle()
	if (error) throw new Error(`Falha ao carregar a cozinha: ${error.message}`)
	return resolvePurchaseUnitId({ unitId: data?.unit_id ?? null, purchaseUnitId: data?.purchase_unit_id ?? null })
}

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
): Promise<{ itemsCount: number; unitId: number | null; kitchenId: number | null } | { error: string; conflict?: boolean }> {
	// Destinatário do XML vence o palpite da chave (a unidade de compra da cozinha que leu);
	// sem destinatário conhecido, fica o que a leitura da chave registrou.
	const unitId = (fields.unit_id as number | null) ?? existing.unit_id
	// A cozinha que leu a chave também cede a nota quando o XML revela que ela é de outra
	// unidade: sem isto, ler a chave de um DANFE alheio e depois enviar o XML deixava a nota
	// com a cozinha errada. Decidido ANTES de gravar itens: a recusa abaixo não deixa sobra.
	const claimedKitchen = existing.kitchen_id ?? (fields.kitchen_id as number | null)
	const destinationUnitId = fields.unit_id as number | null
	const kitchenId = kitchenForImportedNfe({
		requestedKitchenId: claimedKitchen,
		destinationUnitId,
		kitchenPurchaseUnitId: destinationUnitId == null ? null : await purchaseUnitOfKitchen(supabase, claimedKitchen),
	})
	if (claimedKitchen != null && kitchenId == null) {
		// A cozinha já registrou entrega ou liquidação por esta chave, e o XML diz que a nota é de
		// outra OM: ceder a nota em silêncio deixaria o recebimento dela apontando para nota alheia
		// (e a outra unidade poderia receber a mesma mercadoria de novo). É divergência real —
		// a nota continua anunciada e quem enviou fica sabendo.
		const [{ count: receipts, error: receiptsError }, { count: liquidacoes, error: liquidacoesError }] = await Promise.all([
			supabase.from("goods_receipt").select("id", { count: "exact", head: true }).eq("nfe_document_id", existing.id).neq("status", "rejected"),
			supabase.schema("finance").from("liquidacao").select("id", { count: "exact", head: true }).eq("nfe_document_id", existing.id),
		])
		if (receiptsError || liquidacoesError) return { error: `Falha ao conferir o uso da nota: ${(receiptsError ?? liquidacoesError)?.message}` }
		if ((receipts ?? 0) + (liquidacoes ?? 0) > 0) {
			return {
				error:
					"O destinatário deste XML é outra unidade, mas esta nota já sustenta entrega ou liquidação nesta cozinha. O XML não foi aplicado: confira com a unidade destinatária (nota trocada ou mercadoria entregue no lugar errado)",
				conflict: true,
			}
		}
	}

	const itemRows = buildItemRows(existing.id, parsed, costByItem)
	// Nota ainda anunciada não tem item legítimo: sobra de um completamento que morreu entre o
	// insert dos itens e o update do documento. Sem limpar, todo reenvio batia no único
	// (nfe_document_id, n_item) e devolvia 500 para sempre.
	const { error: cleanupError } = await supabase.from("nfe_item").delete().eq("nfe_document_id", existing.id)
	if (cleanupError) return { error: `Falha ao limpar itens de completamento anterior: ${cleanupError.message}` }
	const { error: itemsError } = await supabase.from("nfe_item").insert(itemRows)
	if (itemsError) return { error: `Falha ao gravar nfe_item: ${itemsError.message}` }

	const { data: completed, error: docError } = await supabase
		.from("nfe_document")
		.update({
			...fields,
			access_key: undefined,
			unit_id: unitId,
			destination_confirmed: fields.unit_id != null,
			kitchen_id: kitchenId,
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
	return { itemsCount: itemRows.length, unitId, kitchenId }
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
			// `units` mora em `core`: consultada pelo client do schema `inventory`, a leitura falhava
			// calada e TODA nota caía como destinatário desconhecido.
			const { data: unit, error: unitError } = await supabase.schema("core").from("units").select("id").eq("cnpj", destTaxId).maybeSingle()
			if (unitError) throw new Error(`Falha ao resolver o destinatário: ${unitError.message}`)
			unitId = unit ? Number(unit.id) : null
		}
		const kitchenId = kitchenForImportedNfe({
			requestedKitchenId: kitchen_id ?? null,
			destinationUnitId: unitId,
			// Sem destinatário reconhecido a cozinha fica de qualquer jeito: nem precisa ler a unidade dela.
			kitchenPurchaseUnitId: unitId == null ? null : await purchaseUnitOfKitchen(supabase, kitchen_id ?? null),
		})

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
			kitchen_id: kitchenId,
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
							kitchen_id: completed.kitchenId,
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
				// Nulo com `kitchen_id` pedido: a nota é de outra unidade e foi para a triagem dela.
				kitchen_id: kitchenId,
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
