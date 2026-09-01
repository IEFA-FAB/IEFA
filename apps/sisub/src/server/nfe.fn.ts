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

import { matchNfeItem, type NfeMatchCandidates } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

const API_BASE = (process.env.IEFA_API_BASE_URL || "https://api.iefa.com.br").replace(/\/+$/, "")

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen pós-migration (task 2.4)
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const gs1 = () => getServerClient("gs1_integration") as unknown as LooseClient
const kitchen = () => getServerClient("kitchen") as unknown as LooseClient

/** Autentica, resolve a cozinha do documento e aplica o guard escopado. */
async function requireStorageForDocument(level: 1 | 2, nfeDocumentId: string): Promise<{ userId: string }> {
	const base = await requireAuthWithPermission("storage", level)
	const { data: doc } = await inventory().from("nfe_document").select("kitchen_id").eq("id", nfeDocumentId).maybeSingle()
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
}

interface IngredientItemLinkRow {
	id: string
	gtin: string | null
	purchase_item_id: string | null
	ingredient_id: string | null
	unit_content_quantity: number | null
}

/**
 * Roda o pipeline de matching para todos os itens de um documento e persiste
 * os resultados em UM upsert (atômico). Auto-cria entidades GTIN `source='nfe'`
 * para cEANs válidos desconhecidos (sem conteúdo líquido → item cai em review).
 */
async function runMatchingForDocument(nfeDocumentId: string): Promise<{ matched: number; review: number; noMatch: number }> {
	const inv = inventory()

	const { data: doc, error: docError } = await inv.from("nfe_document").select("id, supplier_cnpj").eq("id", nfeDocumentId).single()
	if (docError || !doc) throw new Error("NF-e não encontrada")

	const { data: items, error: itemsError } = await inv.from("nfe_item").select("*").eq("nfe_document_id", nfeDocumentId)
	if (itemsError) throw new Error(`Erro ao carregar itens: ${itemsError.message}`)
	const nfeItems = (items ?? []) as (NfeItemRow & { nfe_document_id: string })[]
	if (nfeItems.length === 0) return { matched: 0, review: 0, noMatch: 0 }

	// ── Candidatos em lote ───────────────────────────────────────────────────
	const allGtins = [...new Set(nfeItems.flatMap((item) => [item.gtin, item.gtin_trib]).filter((g): g is string => g != null))]

	const linkByGtin = new Map<string, IngredientItemLinkRow>()
	const gtinEntityByGtin = new Map<string, { net_content: number | null; gpc_brick_code: string | null }>()
	if (allGtins.length > 0) {
		const { data: links } = await kitchen()
			.from("ingredient_item")
			.select("id, gtin, purchase_item_id, ingredient_id, unit_content_quantity")
			.in("gtin", allGtins)
			.is("deleted_at", null)
		for (const link of (links ?? []) as IngredientItemLinkRow[]) {
			if (link.gtin) linkByGtin.set(link.gtin, link)
		}

		const { data: entities } = await gs1().from("gtin").select("gtin, net_content, gpc_brick_code").in("gtin", allGtins)
		for (const entity of entities ?? []) gtinEntityByGtin.set(entity.gtin, entity)

		// 4.4 — GTIN visto em NF-e autorizada e desconhecido no catálogo: cria source='nfe'
		const unseen = nfeItems
			.filter((item) => item.gtin != null && !gtinEntityByGtin.has(item.gtin))
			.map((item) => ({ gtin: item.gtin, description: item.description, ncm: item.ncm, source: "nfe" }))
		if (unseen.length > 0) {
			const dedup = [...new Map(unseen.map((row) => [row.gtin, row])).values()]
			const { error: gtinInsertError } = await gs1().from("gtin").upsert(dedup, { onConflict: "gtin", ignoreDuplicates: true })
			if (gtinInsertError) throw new Error(`Erro ao cadastrar GTINs da nota: ${gtinInsertError.message}`)
			for (const row of dedup) gtinEntityByGtin.set(row.gtin as string, { net_content: null, gpc_brick_code: null })
		}
	}

	const supplierCodes = [...new Set(nfeItems.map((item) => item.supplier_code).filter((c): c is string => c != null))]
	const mapByCode = new Map<string, { ingredient_item_id: string | null; purchase_item_id: string | null }>()
	if (doc.supplier_cnpj && supplierCodes.length > 0) {
		const { data: maps } = await gs1()
			.from("supplier_product_map")
			.select("supplier_code, ingredient_item_id, purchase_item_id")
			.eq("supplier_cnpj", doc.supplier_cnpj)
			.in("supplier_code", supplierCodes)
		for (const row of maps ?? []) mapByCode.set(row.supplier_code, row)
	}

	// links dos ingredient_items referenciados pelo supplier map (para conversão)
	const mapItemIds = [...new Set([...mapByCode.values()].map((m) => m.ingredient_item_id).filter((id): id is string => id != null))]
	const linkById = new Map<string, IngredientItemLinkRow>()
	if (mapItemIds.length > 0) {
		const { data: links } = await kitchen()
			.from("ingredient_item")
			.select("id, gtin, purchase_item_id, ingredient_id, unit_content_quantity")
			.in("id", mapItemIds)
			.is("deleted_at", null)
		for (const link of (links ?? []) as IngredientItemLinkRow[]) linkById.set(link.id, link)
	}

	// ── Decisão por item (pura) + sugestões só para quem caiu sem candidato ──
	const updates: Record<string, unknown>[] = []
	let matched = 0
	let review = 0
	let noMatch = 0

	for (const item of nfeItems) {
		const effectiveGtin =
			(item.gtin != null && linkByGtin.has(item.gtin) ? item.gtin : null) ?? (item.gtin_trib != null && linkByGtin.has(item.gtin_trib) ? item.gtin_trib : null)
		const gtinLinkRow = effectiveGtin != null ? (linkByGtin.get(effectiveGtin) ?? null) : null
		const supplierMapRow = item.supplier_code != null ? (mapByCode.get(item.supplier_code) ?? null) : null
		const supplierLinkRow = supplierMapRow?.ingredient_item_id != null ? (linkById.get(supplierMapRow.ingredient_item_id) ?? null) : null

		const candidates: NfeMatchCandidates = {
			gtinLink: gtinLinkRow
				? {
						ingredientItemId: gtinLinkRow.id,
						purchaseItemId: gtinLinkRow.purchase_item_id,
						ingredientId: gtinLinkRow.ingredient_id,
						unitContentQuantity: gtinLinkRow.unit_content_quantity,
					}
				: null,
			gtinNetContent: effectiveGtin != null ? (gtinEntityByGtin.get(effectiveGtin)?.net_content ?? null) : null,
			supplierMapLink: supplierLinkRow
				? {
						ingredientItemId: supplierLinkRow.id,
						purchaseItemId: supplierLinkRow.purchase_item_id ?? supplierMapRow?.purchase_item_id ?? null,
						ingredientId: supplierLinkRow.ingredient_id,
						unitContentQuantity: supplierLinkRow.unit_content_quantity,
					}
				: null,
			supplierMapPurchaseItemId: supplierMapRow?.purchase_item_id ?? null,
			suggestionPurchaseItemIds: [],
		}

		// Sugestões (trigram + brick GPC) só quando nada acima resolveu
		if (!candidates.gtinLink && !candidates.supplierMapLink && !candidates.supplierMapPurchaseItemId && item.description) {
			const brick = item.gtin != null ? (gtinEntityByGtin.get(item.gtin)?.gpc_brick_code ?? null) : null
			const { data: suggestions } = await inv.rpc("suggest_purchase_items", {
				p_description: item.description,
				p_gpc_brick: brick,
				p_limit: 5,
			})
			candidates.suggestionPurchaseItemIds = (suggestions ?? []).map((s: { purchase_item_id: string }) => s.purchase_item_id)
		}

		const result = matchNfeItem({ gtin: item.gtin, gtinTrib: item.gtin_trib, supplierCode: item.supplier_code, commercialQty: item.commercial_qty }, candidates)

		if (result.status === "matched") matched++
		else if (result.status === "review") review++
		else noMatch++

		updates.push({
			id: item.id,
			nfe_document_id: item.nfe_document_id,
			n_item: item.n_item,
			match_status: result.status,
			ingredient_item_id: result.ingredientItemId,
			purchase_item_id: result.purchaseItemId,
			ingredient_id: result.ingredientId,
			matched_qty_base: result.matchedQtyBase,
			updated_at: new Date().toISOString(),
		})
	}

	const { error: upsertError } = await inv.from("nfe_item").upsert(updates, { onConflict: "id" })
	if (upsertError) throw new Error(`Erro ao gravar resultado do matching: ${upsertError.message}`)

	const newStatus = matched === nfeItems.length ? "matched" : "imported"
	await inv.from("nfe_document").update({ status: newStatus }).eq("id", nfeDocumentId)

	return { matched, review, noMatch }
}

/**
 * Uploads an NF-e XML through the API proxy and immediately runs the matching pipeline.
 *
 * @throws {Error} friendly messages for duplicate key (409) and invalid XML (422).
 */
export const uploadNfeFn = createServerFn({ method: "POST" })
	.validator(z.object({ xml: z.string().min(1), kitchenId: z.number().int().positive().optional() }))
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
		const body = (await res.json().catch(() => ({}))) as { document_id?: string; error?: string; items_count?: number }
		if (res.status === 409) throw new Error(body.error ?? "NF-e já importada")
		if (res.status === 422) throw new Error(body.error ?? "XML inválido")
		if (!res.ok || !body.document_id) throw new Error(body.error ?? `API retornou ${res.status}`)

		const matching = await runMatchingForDocument(body.document_id)
		return { documentId: body.document_id, itemsCount: body.items_count ?? 0, matching }
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
			.select("id, access_key, supplier_cnpj, supplier_name, issued_at, total_value, status, created_at")
			.order("created_at", { ascending: false })
			.limit(50)
		// notas da cozinha + notas ainda sem cozinha atribuída
		if (data.kitchenId != null) query = query.or(`kitchen_id.eq.${data.kitchenId},kitchen_id.is.null`)
		const { data: docs, error } = await query
		if (error) throw new Error(`Erro ao listar NF-e: ${error.message}`)
		const documents = (docs ?? []) as NfeDocumentRow[]
		if (documents.length === 0) return []

		const { data: items } = await inv
			.from("nfe_item")
			.select("nfe_document_id, match_status")
			.in(
				"nfe_document_id",
				documents.map((d) => d.id)
			)
		const counts = new Map<string, Record<string, number>>()
		for (const item of items ?? []) {
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

		const { data: doc, error } = await inv.from("nfe_document").select("*").eq("id", data.nfeDocumentId).single()
		if (error || !doc) throw new Error("NF-e não encontrada")
		const { data: items } = await inv.from("nfe_item").select("*").eq("nfe_document_id", data.nfeDocumentId).order("n_item")
		return { ...doc, items: (items ?? []) as NfeItemRow[] } as NfeDocumentRow & { items: NfeItemRow[] }
	})

/** Ranked purchase_item suggestions for a review-queue item (trigram + GPC boost). */
export const fetchNfeItemSuggestionsFn = createServerFn({ method: "GET" })
	.validator(z.object({ nfeItemId: z.uuid() }))
	.handler(async ({ data }) => {
		await requireAuthWithPermission("storage", 1)
		const inv = inventory()

		const { data: item, error } = await inv.from("nfe_item").select("description, gtin, nfe_document_id").eq("id", data.nfeItemId).single()
		if (error || !item?.description) return []
		await requireStorageForDocument(1, item.nfe_document_id)

		const brick =
			item.gtin != null ? ((await gs1().from("gtin").select("gpc_brick_code").eq("gtin", item.gtin).maybeSingle()).data?.gpc_brick_code ?? null) : null
		const { data: suggestions } = await inv.rpc("suggest_purchase_items", { p_description: item.description, p_gpc_brick: brick, p_limit: 8 })
		return (suggestions ?? []) as { purchase_item_id: string; description: string; score: number }[]
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

		const { data: item, error: itemError } = await inv.from("nfe_item").select("*, nfe_document_id").eq("id", data.nfeItemId).single()
		if (itemError || !item) throw new Error("Item de NF-e não encontrado")
		await requireStorageForDocument(2, item.nfe_document_id)

		// Resolve o SKU: direto por id, ou o default do purchase_item escolhido
		// (preferindo o que tem conversão de unidade).
		let link: IngredientItemLinkRow | null = null
		if (data.ingredientItemId) {
			const { data: row } = await kitchen()
				.from("ingredient_item")
				.select("id, gtin, purchase_item_id, ingredient_id, unit_content_quantity")
				.eq("id", data.ingredientItemId)
				.is("deleted_at", null)
				.maybeSingle()
			link = (row as IngredientItemLinkRow | null) ?? null
			if (!link) throw new Error("Item de insumo não encontrado (ou excluído)")
		} else if (data.purchaseItemId) {
			const { data: rows } = await kitchen()
				.from("ingredient_item")
				.select("id, gtin, purchase_item_id, ingredient_id, unit_content_quantity")
				.eq("purchase_item_id", data.purchaseItemId)
				.is("deleted_at", null)
				.order("unit_content_quantity", { ascending: false, nullsFirst: false })
				.limit(1)
			link = ((rows ?? [])[0] as IngredientItemLinkRow | undefined) ?? null
		}

		const purchaseItemId = link?.purchase_item_id ?? data.purchaseItemId ?? null
		const perPackage = link?.unit_content_quantity ?? null
		const qty = perPackage != null && perPackage > 0 && item.commercial_qty != null && item.commercial_qty > 0 ? item.commercial_qty * perPackage : null

		// Aprendizado ANTES do update do item (review: partial state). Se o mapa
		// falhar, nada mudou; se o update do item falhar depois, o mapa já
		// aprendido é idempotente e o retry da resolução converge.
		const { data: doc } = await inv.from("nfe_document").select("supplier_cnpj").eq("id", item.nfe_document_id).single()
		if (doc?.supplier_cnpj && item.supplier_code) {
			const { error: mapError } = await gs1()
				.from("supplier_product_map")
				.upsert(
					{
						supplier_cnpj: doc.supplier_cnpj,
						supplier_code: item.supplier_code,
						ingredient_item_id: link?.id ?? null,
						purchase_item_id: purchaseItemId,
						confidence: "manual",
					},
					{ onConflict: "supplier_cnpj,supplier_code" }
				)
			if (mapError) throw new Error(`Falha ao gravar o mapa do fornecedor (item não alterado): ${mapError.message}`)
		}

		const { error: updateError } = await inv
			.from("nfe_item")
			.update({
				match_status: qty != null ? "matched" : "review",
				ingredient_item_id: link?.id ?? null,
				purchase_item_id: purchaseItemId,
				ingredient_id: link?.ingredient_id ?? null,
				matched_qty_base: qty,
				updated_at: new Date().toISOString(),
			})
			.eq("id", data.nfeItemId)
		if (updateError) throw new Error(`Erro ao resolver item (mapa do fornecedor já aprendido — tente novamente): ${updateError.message}`)

		return { status: qty != null ? "matched" : "review", matchedQtyBase: qty }
	})
