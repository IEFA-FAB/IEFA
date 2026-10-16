/**
 * @module nfe.fn
 * Ingestão de NF-e (Fase 2c do estoque): upload do XML (proxy ao apps/api),
 * pipeline de matching item→insumo (operation pura em @iefa/sisub-domain) e
 * resolução manual com aprendizado (supplier_product_map + vínculo GTIN).
 * CLIENT: getServerClient (service role, schemas inventory/gs1_integration/kitchen);
 *   fetch externo IEFA_API_BASE_URL (carimba ADMIN_SECRET — guard obrigatório).
 * AUTH: `storage` nível 2 para mutações, nível 1 para leitura.
 * TABLES: inventory.nfe_document, inventory.nfe_item, gs1_integration.gtin,
 *   gs1_integration.supplier_product_map, kitchen.ingredient_item.
 * @domain external
 * @migration 20260729150000_inventory_nfe
 */

import type { TableInsert, TableUpdate } from "@iefa/database"
import { matchNfeItem, type NfeMatchStatus, parseNfeAccessKey } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { publicDbMessage, requireReadRow } from "@/lib/db-error-message"
import { purchaseUnitIdOfKitchen } from "@/lib/kitchen-purchase-unit.server"
import {
	buildMatchCandidates,
	buildNfeItemMatchUpdate,
	collectNfeGtins,
	collectSupplierCodes,
	collectSupplierMapItemIds,
	computeManualMatchedQty,
	countMatchStatuses,
	type GtinEntity,
	type IngredientItemLinkRow,
	listUnseenGtins,
	pickSingleDefaultIngredient,
	resolveManualLinkFields,
	resolveNfeDocumentStatus,
	resolveSuggestionQuery,
	type SupplierMapRow,
} from "@/lib/nfe-match-candidates"
import { nfeOwnershipProblem } from "@/lib/nfe-ownership"
import { readAllPagesIn } from "@/lib/read-all-pages"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

const API_BASE = (process.env.IEFA_API_BASE_URL || "https://api.iefa.com.br").replace(/\/+$/, "")

const inventory = () => getServerClient("inventory")
const gs1 = () => getServerClient("gs1_integration")
const kitchen = () => getServerClient("kitchen")
const procurement = () => getServerClient("procurement")

/** Autentica, resolve a cozinha do documento e aplica o guard escopado. */
async function requireStorageForDocument(level: 1 | 2, nfeDocumentId: string): Promise<{ userId: string }> {
	const base = await requireAuthWithPermission("storage", level)
	const { data: doc, error: docError } = await inventory().from("nfe_document").select("kitchen_id").eq("id", nfeDocumentId).maybeSingle()
	if (docError) throw new Error(`Erro ao carregar a NF-e: ${publicDbMessage(docError)}`)
	if (!doc) throw new Error("NF-e não encontrada")
	await requireStorageForKitchen(level, doc.kitchen_id != null ? Number(doc.kitchen_id) : null)
	return { userId: base.userId }
}

export interface NfeItemRow {
	id: string
	n_item: number
	supplier_code: string | null
	description: string | null
	gtin: string | null
	gtin_trib: string | null
	ncm: string | null
	commercial_unit: string | null
	commercial_qty: number | null
	unit_price: number | null
	lot_code: string | null
	expiry_date: string | null
	match_status: "pending" | "matched" | "review" | "no_match"
	ingredient_item_id: string | null
	purchase_item_id: string | null
	ingredient_id: string | null
	matched_qty_base: number | null
}

export interface NfeDocumentRow {
	id: string
	access_key: string
	supplier_cnpj: string | null
	supplier_name: string | null
	issued_at: string | null
	total_value: number | null
	status: string
	created_at: string
	/** Nula enquanto a nota é da UNIDADE e nenhuma cozinha a assumiu. */
	kitchen_id?: number | null
	unit_id?: number | null
	destination_confirmed?: boolean
	situation_result?: "authorized" | "cancelled" | "unknown" | null
	situation_checked_at?: string | null
}

/** Vínculos e catálogo pelo GTIN. GTIN desconhecido no catálogo é cadastrado aqui como `source='nfe'`. */
async function loadGtinCandidates(
	nfeItems: ReadonlyArray<{ gtin: string | null; gtin_trib: string | null; description: string | null; ncm: string | null }>
): Promise<{ linkByGtin: Map<string, IngredientItemLinkRow>; gtinEntityByGtin: Map<string, GtinEntity> }> {
	const allGtins = collectNfeGtins(nfeItems)

	const linkByGtin = new Map<string, IngredientItemLinkRow>()
	const gtinEntityByGtin = new Map<string, GtinEntity>()
	if (allGtins.length === 0) return { linkByGtin, gtinEntityByGtin }

	// Leitura que falha aqui não é "sem candidato": o upsert abaixo rebaixaria itens já casados.
	const { data: links, error: linksError } = await kitchen()
		.from("ingredient_item")
		.select("id, gtin, purchase_item_id, ingredient_id, unit_content_quantity")
		.in("gtin", allGtins)
		.is("deleted_at", null)
	if (linksError) throw new Error(`Erro ao ler os itens de insumo pelo GTIN: ${publicDbMessage(linksError)}`)
	for (const link of links ?? []) {
		if (link.gtin) linkByGtin.set(link.gtin, link)
	}

	const { data: entities, error: entitiesError } = await gs1().from("gtin").select("gtin, net_content, gpc_brick_code").in("gtin", allGtins)
	if (entitiesError) throw new Error(`Erro ao ler o catálogo GTIN: ${publicDbMessage(entitiesError)}`)
	for (const entity of entities ?? []) gtinEntityByGtin.set(entity.gtin, entity)

	// 4.4 — GTIN visto em NF-e autorizada e desconhecido no catálogo: cria source='nfe'
	const dedup = listUnseenGtins(nfeItems, gtinEntityByGtin)
	if (dedup.length > 0) {
		const { error: gtinInsertError } = await gs1().from("gtin").upsert(dedup, { onConflict: "gtin", ignoreDuplicates: true })
		if (gtinInsertError) throw new Error(`Erro ao cadastrar GTINs da nota: ${publicDbMessage(gtinInsertError)}`)
		for (const row of dedup) gtinEntityByGtin.set(row.gtin, { net_content: null, gpc_brick_code: null })
	}
	return { linkByGtin, gtinEntityByGtin }
}

/** Mapa (CNPJ emitente, cProd) → item, aprendido nas resoluções manuais. */
async function loadSupplierMap(supplierCnpj: string | null, nfeItems: ReadonlyArray<{ supplier_code: string | null }>): Promise<Map<string, SupplierMapRow>> {
	const supplierCodes = collectSupplierCodes(nfeItems)
	const mapByCode = new Map<string, SupplierMapRow>()
	if (!supplierCnpj || supplierCodes.length === 0) return mapByCode
	const { data: maps, error: mapsError } = await gs1()
		.from("supplier_product_map")
		.select("supplier_code, ingredient_item_id, purchase_item_id")
		.eq("supplier_cnpj", supplierCnpj)
		.in("supplier_code", supplierCodes)
	if (mapsError) throw new Error(`Erro ao ler o mapa do fornecedor: ${publicDbMessage(mapsError)}`)
	for (const row of maps ?? []) mapByCode.set(row.supplier_code, row)
	return mapByCode
}

/** Links dos ingredient_items referenciados pelo supplier map (para conversão). */
async function loadSupplierMapLinks(mapItemIds: string[]): Promise<Map<string, IngredientItemLinkRow>> {
	const linkById = new Map<string, IngredientItemLinkRow>()
	if (mapItemIds.length === 0) return linkById
	const { data: links, error: linksError } = await kitchen()
		.from("ingredient_item")
		.select("id, gtin, purchase_item_id, ingredient_id, unit_content_quantity")
		.in("id", mapItemIds)
		.is("deleted_at", null)
	if (linksError) throw new Error(`Erro ao ler os itens de insumo do mapa do fornecedor: ${publicDbMessage(linksError)}`)
	for (const link of links ?? []) linkById.set(link.id, link)
	return linkById
}

async function suggestPurchaseItemIds(inv: ReturnType<typeof inventory>, query: { description: string; brick: string | null }): Promise<string[]> {
	const { data: suggestions, error: suggestionsError } = await inv.rpc("suggest_purchase_items", {
		p_description: query.description,
		p_gpc_brick: query.brick ?? undefined,
		p_limit: 5,
	})
	if (suggestionsError) throw new Error(`Erro ao sugerir itens de compra: ${publicDbMessage(suggestionsError)}`)
	return (suggestions ?? []).map((s) => s.purchase_item_id)
}

/**
 * Roda o pipeline de matching para todos os itens de um documento e persiste
 * os resultados em UM upsert (atômico). Auto-cria entidades GTIN `source='nfe'`
 * para cEANs válidos desconhecidos (sem conteúdo líquido → item cai em review).
 */
async function runMatchingForDocument(nfeDocumentId: string): Promise<{ matched: number; review: number; noMatch: number }> {
	const inv = inventory()

	const doc = requireReadRow(await inv.from("nfe_document").select("id, supplier_cnpj").eq("id", nfeDocumentId).maybeSingle(), {
		readFailure: "Erro ao carregar a NF-e",
		notFound: "NF-e não encontrada",
	})

	const { data: items, error: itemsError } = await inv.from("nfe_item").select("*").eq("nfe_document_id", nfeDocumentId)
	if (itemsError) throw new Error(`Erro ao carregar itens: ${publicDbMessage(itemsError)}`)
	const nfeItems = items ?? []
	if (nfeItems.length === 0) return { matched: 0, review: 0, noMatch: 0 }

	// ── Candidatos em lote ───────────────────────────────────────────────────
	const { linkByGtin, gtinEntityByGtin } = await loadGtinCandidates(nfeItems)
	const mapByCode = await loadSupplierMap(doc.supplier_cnpj, nfeItems)
	const linkById = await loadSupplierMapLinks(collectSupplierMapItemIds(mapByCode))
	const index = { linkByGtin, gtinEntityByGtin, mapByCode, linkById }

	// ── Decisão por item (pura) + sugestões só para quem caiu sem candidato ──
	const updates: TableInsert<"inventory", "nfe_item">[] = []
	const statuses: NfeMatchStatus[] = []

	for (const item of nfeItems) {
		const candidates = buildMatchCandidates(item, index)
		const suggestionQuery = resolveSuggestionQuery(item, candidates, gtinEntityByGtin)
		if (suggestionQuery) candidates.suggestionPurchaseItemIds = await suggestPurchaseItemIds(inv, suggestionQuery)

		const result = matchNfeItem({ gtin: item.gtin, gtinTrib: item.gtin_trib, supplierCode: item.supplier_code, commercialQty: item.commercial_qty }, candidates)
		statuses.push(result.status)
		updates.push(buildNfeItemMatchUpdate(item, result, new Date().toISOString()))
	}
	const { matched, review, noMatch } = countMatchStatuses(statuses)

	const { error: upsertError } = await inv.from("nfe_item").upsert(updates, { onConflict: "id" })
	if (upsertError) throw new Error(`Erro ao gravar resultado do matching: ${publicDbMessage(upsertError)}`)

	const newStatus = resolveNfeDocumentStatus(matched, nfeItems.length)
	const { error: statusError } = await inv.from("nfe_document").update({ status: newStatus }).eq("id", nfeDocumentId)
	if (statusError) throw new Error(`Erro ao atualizar a situação da NF-e: ${publicDbMessage(statusError)}`)

	return { matched, review, noMatch }
}

/** 5 MB de texto: folga de 4× sobre a maior NF-e plausível. */
const NFE_XML_MAX_CHARS = 5 * 1024 * 1024

/**
 * Uploads an NF-e XML through the API proxy and immediately runs the matching pipeline.
 *
 * @throws {Error} friendly messages for duplicate key (409) and invalid XML (422).
 */
export const uploadNfeFn = createServerFn({ method: "POST" })
	// Teto do XML: NF-e real fica na casa das dezenas de KB (a maior, com centenas de itens,
	// passa pouco de 1 MB). Sem teto, o servidor aceitava e repassava ao proxy qualquer volume.
	.validator(z.object({ xml: z.string().min(1).max(NFE_XML_MAX_CHARS, "XML da NF-e grande demais"), kitchenId: z.number().int().positive().optional() }))
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(2, data.kitchenId ?? null)

		const params = new URLSearchParams()
		if (data.kitchenId != null) params.set("kitchen_id", String(data.kitchenId))
		params.set("created_by", userId)

		const res = await fetch(`${API_BASE}/api/admin/nfe/import?${params}`, {
			method: "POST",
			headers: { "Content-Type": "application/xml", "x-admin-secret": process.env.ADMIN_SECRET ?? "" },
			body: data.xml,
		})
		const body = (await res.json().catch(() => ({}))) as {
			document_id?: string
			error?: string
			items_count?: number
			kitchen_id?: number | null
			unit_id?: number | null
		}
		if (res.status === 409) throw new Error(body.error ?? "NF-e já importada")
		if (res.status === 422) throw new Error(body.error ?? "XML inválido")
		if (!res.ok || !body.document_id) throw new Error(body.error ?? `API retornou ${res.status}`)

		const matching = await runMatchingForDocument(body.document_id)
		// O destinatário do XML é de OUTRA unidade que não a de compra desta cozinha: a API grava a
		// nota sem cozinha, na triagem da unidade certa, e a tela avisa para onde ela foi — em vez
		// de deixar a cozinha que enviou receber (e liquidar) a mercadoria de outra OM.
		const routedToOtherUnit = data.kitchenId != null && body.kitchen_id === null && body.unit_id != null
		return { documentId: body.document_id, itemsCount: body.items_count ?? 0, matching, routedToOtherUnit }
	})

/**
 * Entrada da nota pela CHAVE DE ACESSO, lida do código de barras do DANFE.
 *
 * Sem certificado digital não há como buscar a nota na SEFAZ, e o XML do
 * fornecedor costuma chegar depois da mercadoria. A chave está impressa no
 * DANFE que vem com o caminhão: ela cria a nota `announced` com emitente,
 * série, número e mês de emissão — que é tudo o que a chave carrega — e o
 * painel "A caminho" passa a saber que a nota existe.
 *
 * O destinatário NÃO está na chave. A nota herda a unidade de compra da cozinha
 * onde foi lida, marcada como não confirmada, até o XML chegar.
 */
export const createNfeFromAccessKeyFn = createServerFn({ method: "POST" })
	.validator(z.object({ kitchenId: z.number().int().positive(), accessKey: z.string().min(44).max(60) }))
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(2, data.kitchenId)
		const parsed = parseNfeAccessKey(data.accessKey)
		if (!parsed) throw new Error("Chave de acesso inválida — confira o dígito verificador")

		const inv = inventory()
		const unitId = await purchaseUnitIdOfKitchen(data.kitchenId)

		const { data: existing, error: existingError } = await inv
			.from("nfe_document")
			.select("id, status, kitchen_id, unit_id")
			.eq("access_key", parsed.key)
			.maybeSingle()
		if (existingError) throw new Error(`Erro ao carregar a NF-e pela chave: ${publicDbMessage(existingError)}`)
		if (existing) {
			// Nota já conhecida. As mesmas travas de `claimNfeForKitchenFn`: sem elas, ler a chave
			// de uma nota de OUTRA unidade (ela está impressa no DANFE) bastava para assumi-la, e
			// a nota de outra cozinha devolvia o id dela a quem não pode abri-la.
			const problem = nfeOwnershipProblem({
				docKitchenId: existing.kitchen_id != null ? Number(existing.kitchen_id) : null,
				docUnitId: existing.unit_id != null ? Number(existing.unit_id) : null,
				kitchenId: data.kitchenId,
				kitchenPurchaseUnitId: unitId,
			})
			if (problem) throw new Error(problem)
			// Sem dono: assume para esta cozinha. `is(kitchen_id, null)` fecha a corrida com outra
			// cozinha assumindo ao mesmo tempo — desde que se confira que ESTE update pegou a linha:
			// quem perde a corrida atualiza zero linhas, e sem a conferência receberia o id da nota
			// que acabou de virar da outra cozinha.
			if (existing.kitchen_id == null) {
				const { data: claimed, error } = await inv
					.from("nfe_document")
					.update({ kitchen_id: data.kitchenId })
					.eq("id", existing.id)
					.is("kitchen_id", null)
					.eq("unit_id", Number(existing.unit_id))
					.select("id")
				if (error) throw new Error(`Erro ao assumir a nota: ${publicDbMessage(error)}`)
				if (!claimed || claimed.length === 0)
					throw new Error("A nota mudou enquanto era registrada (outra cozinha a assumiu ou a triagem mudou a unidade) — recarregue a lista")
			}
			return { nfeDocumentId: existing.id, created: false, status: existing.status }
		}

		// AAMM da chave → primeiro dia do mês de emissão. É uma aproximação
		// deliberada: a chave não traz o dia, e inventar um é pior que assumir o
		// mês, que é o que o painel usa para ordenar.
		const issuedMonth = `20${parsed.yearMonth.slice(0, 2)}-${parsed.yearMonth.slice(2, 4)}-01`

		const { data: doc, error } = await inv
			.from("nfe_document")
			.insert({
				access_key: parsed.key,
				supplier_cnpj: parsed.issuerTaxId,
				status: "announced",
				kitchen_id: data.kitchenId,
				unit_id: unitId,
				destination_confirmed: false,
				issued_at: issuedMonth,
				created_by: userId,
			})
			.select("id")
			.single()
		if (error || !doc) throw new Error(`Erro ao registrar a nota pela chave: ${publicDbMessage(error)}`)
		return { nfeDocumentId: doc.id, created: true, status: "announced" }
	})

/**
 * Registra a consulta de situação da nota feita no portal da SEFAZ.
 *
 * Sem coletor DF-e, esta é a única forma de saber que a nota foi CANCELADA
 * depois de importada — e liquidar nota cancelada é pagamento sem documento
 * hábil (Lei 4.320, art. 63). O recebimento definitivo e a liquidação exigem
 * consulta recente.
 */
export const registerNfeSituationFn = createServerFn({ method: "POST" })
	.validator(z.object({ nfeDocumentId: z.uuid(), result: z.enum(["authorized", "cancelled", "unknown"]), note: z.string().max(300).optional() }))
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForDocument(2, data.nfeDocumentId)
		const inv = inventory()
		const update: TableUpdate<"inventory", "nfe_document"> = {
			situation_checked_at: new Date().toISOString(),
			situation_checked_by: userId,
			situation_result: data.result,
		}
		if (data.result === "cancelled") {
			update.status = "cancelled"
			update.cancelled_reason = data.note?.trim() || "Cancelada pelo emitente (consulta na SEFAZ)"
		}
		const { error } = await inv.from("nfe_document").update(update).eq("id", data.nfeDocumentId)
		if (error) throw new Error(`Erro ao registrar a situação: ${publicDbMessage(error)}`)
		return { saved: true }
	})

/** Assume para esta cozinha uma nota endereçada à unidade de compra dela. */
export const claimNfeForKitchenFn = createServerFn({ method: "POST" })
	.validator(z.object({ nfeDocumentId: z.uuid(), kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(2, data.kitchenId)
		const inv = inventory()
		const { data: doc, error: docError } = await inv.from("nfe_document").select("id, kitchen_id, unit_id").eq("id", data.nfeDocumentId).maybeSingle()
		if (docError) throw new Error(`Erro ao carregar a nota: ${publicDbMessage(docError)}`)
		if (!doc) throw new Error("NF-e não encontrada")
		if (doc.kitchen_id != null && Number(doc.kitchen_id) === data.kitchenId) return { claimed: true }

		// A nota é da UNIDADE: cozinha de outra unidade não a assume, e nota sem unidade (triagem
		// global, destinatário não reconhecido) não é de cozinha nenhuma até a triagem atribuí-la.
		// Antes, `unit_id` nulo passava direto e qualquer cozinha tomava a nota da triagem.
		const problem = nfeOwnershipProblem({
			docKitchenId: doc.kitchen_id != null ? Number(doc.kitchen_id) : null,
			docUnitId: doc.unit_id != null ? Number(doc.unit_id) : null,
			kitchenId: data.kitchenId,
			kitchenPurchaseUnitId: await purchaseUnitIdOfKitchen(data.kitchenId),
		})
		if (problem) throw new Error(problem)

		// `is(kitchen_id, null)` + conferir que ESTE update pegou a linha: duas cozinhas da mesma
		// unidade assumindo ao mesmo tempo passavam as duas na leitura, e a segunda tomava a nota
		// da primeira. Quem perde a corrida atualiza zero linhas.
		const { data: claimed, error } = await inv
			.from("nfe_document")
			.update({ kitchen_id: data.kitchenId })
			.eq("id", data.nfeDocumentId)
			.is("kitchen_id", null)
			.eq("unit_id", Number(doc.unit_id))
			.select("id")
		if (error) throw new Error(`Erro ao assumir a nota: ${publicDbMessage(error)}`)
		if (!claimed || claimed.length === 0)
			throw new Error("A nota mudou enquanto você a assumia (outra cozinha a assumiu ou a triagem mudou a unidade) — recarregue a lista")
		return { claimed: true }
	})

/** Notas sem unidade resolvida — triagem do nível 3 global. */
export const listUnassignedNfeFn = createServerFn({ method: "GET" })
	.validator(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(3, null)
		const inv = inventory()
		const {
			data: docs,
			count,
			error,
		} = await inv
			.from("nfe_document")
			.select("id, access_key, supplier_cnpj, supplier_name, dest_cnpj, issued_at, total_value, status, created_at", { count: "exact" })
			.is("unit_id", null)
			.order("created_at", { ascending: false })
			.limit(data.limit)
		if (error) throw new Error(`Erro ao listar notas em triagem: ${publicDbMessage(error)}`)
		return { documents: docs ?? [], total: count ?? (docs ?? []).length }
	})

/** Atribui manualmente a unidade de uma nota em triagem. */
export const assignNfeUnitFn = createServerFn({ method: "POST" })
	.validator(z.object({ nfeDocumentId: z.uuid(), unitId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(3, null)
		const inv = inventory()
		const { data: doc, error: docError } = await inv.from("nfe_document").select("kitchen_id").eq("id", data.nfeDocumentId).maybeSingle()
		if (docError) throw new Error(`Erro ao carregar a nota: ${publicDbMessage(docError)}`)
		if (!doc) throw new Error("NF-e não encontrada")
		// A nota enviada por uma cozinha com destinatário desconhecido fica com ela. Atribuída a OUTRA
		// unidade, deixa de ser daquela cozinha e vai para as cozinhas da unidade atribuída — senão a
		// cozinha que enviou seguiria dona de uma nota de outra OM.
		const keepsKitchen = doc.kitchen_id != null && (await purchaseUnitIdOfKitchen(Number(doc.kitchen_id))) === data.unitId
		const { error } = await inv
			.from("nfe_document")
			.update({ unit_id: data.unitId, destination_confirmed: false, ...(keepsKitchen ? {} : { kitchen_id: null }) })
			.eq("id", data.nfeDocumentId)
		if (error) throw new Error(`Erro ao atribuir a unidade: ${publicDbMessage(error)}`)
		return { assigned: true }
	})

/** Re-runs matching for a document (e.g. after catalog/supplier-map growth). */
export const runNfeMatchingFn = createServerFn({ method: "POST" })
	.validator(z.object({ nfeDocumentId: z.uuid() }))
	.handler(async ({ data }) => {
		await requireStorageForDocument(2, data.nfeDocumentId)
		return runMatchingForDocument(data.nfeDocumentId)
	})

/** Lists imported NF-e documents (most recent first) with per-status item counts. */
export const listNfeDocumentsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive().optional() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId ?? null)
		const inv = inventory()

		let query = inv
			.from("nfe_document")
			.select(
				"id, access_key, supplier_cnpj, supplier_name, issued_at, total_value, status, created_at, kitchen_id, unit_id, destination_confirmed, situation_result"
			)
			.order("created_at", { ascending: false })
			.limit(50)
		// Nota desta cozinha MAIS nota endereçada à unidade de compra dela e ainda
		// sem cozinha: a NF-e chega no CNPJ da OM, não da cozinha, e é um operador
		// de uma das cozinhas da unidade que a assume. Nota sem unidade resolvida
		// não entra aqui — ela fica na triagem do nível 3 global.
		if (data.kitchenId != null) {
			const unitId = await purchaseUnitIdOfKitchen(data.kitchenId)
			query = unitId != null ? query.or(`kitchen_id.eq.${data.kitchenId},and(unit_id.eq.${unitId},kitchen_id.is.null)`) : query.eq("kitchen_id", data.kitchenId)
		}
		const { data: docs, error } = await query
		if (error) throw new Error(`Erro ao listar NF-e: ${publicDbMessage(error)}`)
		const documents = (docs ?? []) as NfeDocumentRow[]
		if (documents.length === 0) return []

		// 50 notas de 30 itens já passam de 1000 linhas: paginada, para a contagem por situação não cortar.
		const items = await readAllPagesIn(
			"os itens das notas",
			documents.map((d) => d.id),
			(chunk, from, to) => inv.from("nfe_item").select("id, nfe_document_id, match_status").in("nfe_document_id", chunk).order("id").range(from, to)
		)
		const counts = new Map<string, Record<string, number>>()
		for (const item of items) {
			const acc = counts.get(item.nfe_document_id) ?? {}
			acc[item.match_status] = (acc[item.match_status] ?? 0) + 1
			counts.set(item.nfe_document_id, acc)
		}
		return documents.map((doc) => ({ ...doc, itemCounts: counts.get(doc.id) ?? {} }))
	})

/** Fetches one NF-e document with its items ordered by n_item. */
export const fetchNfeDocumentFn = createServerFn({ method: "GET" })
	.validator(z.object({ nfeDocumentId: z.uuid() }))
	.handler(async ({ data }) => {
		await requireStorageForDocument(1, data.nfeDocumentId)
		const inv = inventory()

		const { data: doc, error } = await inv.from("nfe_document").select("*").eq("id", data.nfeDocumentId).maybeSingle()
		if (error) throw new Error(`Erro ao carregar a NF-e: ${publicDbMessage(error)}`)
		if (!doc) throw new Error("NF-e não encontrada")
		const { data: items, error: itemsError } = await inv.from("nfe_item").select("*").eq("nfe_document_id", data.nfeDocumentId).order("n_item")
		if (itemsError) throw new Error(`Erro ao carregar os itens da NF-e: ${publicDbMessage(itemsError)}`)
		return { ...doc, items: (items ?? []) as NfeItemRow[] } as NfeDocumentRow & { items: NfeItemRow[] }
	})

/** Ranked purchase_item suggestions for a review-queue item (trigram + GPC boost). */
export const fetchNfeItemSuggestionsFn = createServerFn({ method: "GET" })
	.validator(z.object({ nfeItemId: z.uuid() }))
	.handler(async ({ data }) => {
		await requireAuthWithPermission("storage", 1)
		const inv = inventory()

		const item = requireReadRow(await inv.from("nfe_item").select("description, gtin, nfe_document_id").eq("id", data.nfeItemId).maybeSingle(), {
			readFailure: "Erro ao carregar o item da NF-e",
			notFound: "Item de NF-e não encontrado",
		})
		await requireStorageForDocument(1, item.nfe_document_id)
		// Sem descrição não há texto para sugerir: lista vazia, que é resposta, não falha.
		if (!item.description) return []

		// Falha na leitura do GTIN sobe: descartada, a sugestão saía sem o reforço do brick, e uma
		// lista vazia ou pior lida como "nenhum candidato". GTIN que não está no catálogo é só sem brick.
		let brick: string | null = null
		if (item.gtin != null) {
			const { data: gtinRow, error: gtinError } = await gs1().from("gtin").select("gpc_brick_code").eq("gtin", item.gtin).maybeSingle()
			if (gtinError) throw new Error(`Erro ao ler o GTIN do item: ${publicDbMessage(gtinError)}`)
			brick = gtinRow?.gpc_brick_code ?? null
		}
		const { data: suggestions, error: suggestionsError } = await inv.rpc("suggest_purchase_items", {
			p_description: item.description,
			p_gpc_brick: brick ?? undefined,
			p_limit: 8,
		})
		if (suggestionsError) throw new Error(`Erro ao sugerir itens de compra: ${publicDbMessage(suggestionsError)}`)
		return suggestions ?? []
	})

/**
 * Manual resolution: links the NF-e item to an ingredient_item and LEARNS —
 * upserts (CNPJ, cProd) into supplier_product_map so the next invoice from the
 * same supplier resolves automatically (spec `nfe-ingestion`, aprendizado).
 */
export const resolveNfeItemFn = createServerFn({ method: "POST" })
	.validator(
		z
			.object({
				nfeItemId: z.uuid(),
				ingredientItemId: z.uuid().optional(),
				purchaseItemId: z.uuid().optional(),
			})
			.refine((value) => value.ingredientItemId != null || value.purchaseItemId != null, {
				message: "Informe ingredientItemId ou purchaseItemId",
			})
	)
	.handler(async ({ data }) => {
		await requireAuthWithPermission("storage", 2)
		const inv = inventory()

		const item = requireReadRow(await inv.from("nfe_item").select("*, nfe_document_id").eq("id", data.nfeItemId).maybeSingle(), {
			readFailure: "Erro ao carregar o item da NF-e",
			notFound: "Item de NF-e não encontrado",
		})
		await requireStorageForDocument(2, item.nfe_document_id)

		const link = await loadResolutionLink(data)

		const { ingredientItemId, purchaseItemId, perPackage, ingredientId: linkIngredientId } = resolveManualLinkFields(link, data.purchaseItemId)

		// Item de compra sem embalagem cadastrada (sem ingredient_item): o insumo vem do vínculo
		// padrão do item de compra. Sem isto a linha ficava sem insumo, e o recebimento recusa a
		// nota INTEIRA enquanto houver linha sem insumo — arroz e feijão a granel, sem GTIN,
		// travavam a nota toda sem a tela oferecer saída. A quantidade fica nula: o conferente
		// informa o recebido na conferência (o recebimento já trata faturado nulo).
		// Só com UM insumo padrão: há item de compra que é "padrão" de 16 insumos (o arroz polido
		// é padrão de "Arroz Doce", "Arroz à Grega"…) e escolher o primeiro seria sortear o estoque.
		let ingredientId: string | null = linkIngredientId
		if (ingredientId == null && purchaseItemId != null) ingredientId = await loadSingleDefaultIngredient(purchaseItemId)
		const qty = computeManualMatchedQty(perPackage, item.commercial_qty)

		// Aprendizado ANTES do update do item (review: partial state). Se o mapa
		// falhar, nada mudou; se o update do item falhar depois, o mapa já
		// aprendido é idempotente e o retry da resolução converge.
		const { data: doc, error: docError } = await inv.from("nfe_document").select("supplier_cnpj").eq("id", item.nfe_document_id).single()
		if (docError) throw new Error(`Erro ao ler o fornecedor da NF-e: ${publicDbMessage(docError)}`)
		if (doc?.supplier_cnpj && item.supplier_code) {
			await learnSupplierMap({ supplierCnpj: doc.supplier_cnpj, supplierCode: item.supplier_code, ingredientItemId, purchaseItemId })
		}

		const status = qty != null ? "matched" : "review"
		const { error: updateError } = await inv
			.from("nfe_item")
			.update({
				match_status: status,
				ingredient_item_id: ingredientItemId,
				purchase_item_id: purchaseItemId,
				ingredient_id: ingredientId,
				matched_qty_base: qty,
				updated_at: new Date().toISOString(),
			})
			.eq("id", data.nfeItemId)
		if (updateError) throw new Error(`Erro ao resolver item (mapa do fornecedor já aprendido — tente novamente): ${publicDbMessage(updateError)}`)

		return { status, matchedQtyBase: qty }
	})

/**
 * Resolve o SKU: direto por id, ou o default do purchase_item escolhido
 * (preferindo o que tem conversão de unidade).
 */
async function loadResolutionLink(data: { ingredientItemId?: string; purchaseItemId?: string }): Promise<IngredientItemLinkRow | null> {
	if (data.ingredientItemId) {
		const { data: row, error: rowError } = await kitchen()
			.from("ingredient_item")
			.select("id, gtin, purchase_item_id, ingredient_id, unit_content_quantity")
			.eq("id", data.ingredientItemId)
			.is("deleted_at", null)
			.maybeSingle()
		if (rowError) throw new Error(`Erro ao ler o item de insumo: ${publicDbMessage(rowError)}`)
		const link = row ?? null
		if (!link) throw new Error("Item de insumo não encontrado (ou excluído)")
		return link
	}
	if (data.purchaseItemId) {
		// Erro aqui não pode virar "sem embalagem": o mapa do fornecedor seria regravado sem o SKU.
		const { data: rows, error: rowsError } = await kitchen()
			.from("ingredient_item")
			.select("id, gtin, purchase_item_id, ingredient_id, unit_content_quantity")
			.eq("purchase_item_id", data.purchaseItemId)
			.is("deleted_at", null)
			.order("unit_content_quantity", { ascending: false, nullsFirst: false })
			.limit(1)
		if (rowsError) throw new Error(`Erro ao ler as embalagens do item de compra: ${publicDbMessage(rowsError)}`)
		return rows?.[0] ?? null
	}
	return null
}

/** Insumo padrão do item de compra, só quando há um único (`pickSingleDefaultIngredient`). */
async function loadSingleDefaultIngredient(purchaseItemId: string): Promise<string | null> {
	const { data: defaultLinks, error: defaultError } = await procurement()
		.from("purchase_item_ingredient")
		.select("ingredient_id")
		.eq("purchase_item_id", purchaseItemId)
		.eq("is_default", true)
		.limit(2)
	if (defaultError) throw new Error(`Erro ao ler o insumo padrão do item de compra: ${publicDbMessage(defaultError)}`)
	return pickSingleDefaultIngredient(defaultLinks)
}

/** Aprende (CNPJ, cProd) no mapa do fornecedor: a próxima nota do mesmo fornecedor casa sozinha. */
async function learnSupplierMap(row: {
	supplierCnpj: string
	supplierCode: string
	ingredientItemId: string | null
	purchaseItemId: string | null
}): Promise<void> {
	const { error: mapError } = await gs1().from("supplier_product_map").upsert(
		{
			supplier_cnpj: row.supplierCnpj,
			supplier_code: row.supplierCode,
			ingredient_item_id: row.ingredientItemId,
			purchase_item_id: row.purchaseItemId,
			confidence: "manual",
		},
		{ onConflict: "supplier_cnpj,supplier_code" }
	)
	if (mapError) throw new Error(`Falha ao gravar o mapa do fornecedor (item não alterado): ${publicDbMessage(mapError)}`)
}
