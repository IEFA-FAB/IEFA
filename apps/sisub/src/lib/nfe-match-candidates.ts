/**
 * Montagem pura dos candidatos do matching de NF-e (`runMatchingForDocument` e `resolveNfeItemFn`).
 *
 * A decisão por item é `matchNfeItem` (`@iefa/sisub-domain`); aqui fica o que a server fn fazia em
 * volta dela: chaves das leituras em lote, candidatos por item, linha do upsert e contadores. Fora de
 * `nfe.fn.ts` porque teste unitário não pode importar `@/server/*`.
 */

import type { TableInsert, TableRow } from "@iefa/database"
import type { IngredientItemLink, NfeMatchCandidates, NfeMatchResult, NfeMatchStatus } from "@iefa/sisub-domain"

export type IngredientItemLinkRow = Pick<TableRow<"kitchen", "ingredient_item">, "id" | "gtin" | "purchase_item_id" | "ingredient_id" | "unit_content_quantity">

export interface GtinEntity {
	net_content: number | null
	gpc_brick_code: string | null
}

export interface SupplierMapRow {
	ingredient_item_id: string | null
	purchase_item_id: string | null
}

/** Os campos do item de NF-e que o matching lê. */
export interface NfeItemForCandidates {
	gtin: string | null
	gtin_trib: string | null
	supplier_code: string | null
	description: string | null
}

/** Leituras em lote, indexadas, de onde saem os candidatos de cada item. */
export interface MatchCandidateIndex {
	linkByGtin: ReadonlyMap<string, IngredientItemLinkRow>
	gtinEntityByGtin: ReadonlyMap<string, GtinEntity>
	mapByCode: ReadonlyMap<string, SupplierMapRow>
	linkById: ReadonlyMap<string, IngredientItemLinkRow>
}

function getOrNull<V>(map: ReadonlyMap<string, V>, key: string | null | undefined): V | null {
	return key != null ? (map.get(key) ?? null) : null
}

// ─── Chaves das leituras em lote ─────────────────────────────────────────────

/** cEAN e cEANTrib de todos os itens, sem repetição. */
export function collectNfeGtins(items: ReadonlyArray<Pick<NfeItemForCandidates, "gtin" | "gtin_trib">>): string[] {
	return [...new Set(items.flatMap((item) => [item.gtin, item.gtin_trib]).filter((g) => g != null))]
}

/**
 * 4.4 — GTIN visto em NF-e autorizada e desconhecido no catálogo: vira linha `source='nfe'`. Um
 * GTIN repetido na nota entra uma vez, na posição da primeira ocorrência e com os dados da última.
 */
export function listUnseenGtins(
	items: ReadonlyArray<{ gtin: string | null; description: string | null; ncm: string | null }>,
	known: ReadonlyMap<string, unknown>
): Array<{ gtin: string; description: string | null; ncm: string | null; source: "nfe" }> {
	const unseen = items.flatMap((item) =>
		item.gtin != null && !known.has(item.gtin) ? [{ gtin: item.gtin, description: item.description, ncm: item.ncm, source: "nfe" as const }] : []
	)
	return [...new Map(unseen.map((row) => [row.gtin, row])).values()]
}

export function collectSupplierCodes(items: ReadonlyArray<Pick<NfeItemForCandidates, "supplier_code">>): string[] {
	return [...new Set(items.map((item) => item.supplier_code).filter((c) => c != null))]
}

/** ingredient_items referenciados pelo mapa do fornecedor (para conversão). */
export function collectSupplierMapItemIds(mapByCode: ReadonlyMap<string, SupplierMapRow>): string[] {
	return [...new Set([...mapByCode.values()].map((m) => m.ingredient_item_id).filter((id) => id != null))]
}

// ─── Candidatos por item ─────────────────────────────────────────────────────

function pickLinkedGtin(gtin: string | null, linkByGtin: ReadonlyMap<string, unknown>): string | null {
	return gtin != null && linkByGtin.has(gtin) ? gtin : null
}

function toIngredientItemLink(row: IngredientItemLinkRow, purchaseItemId: string | null): IngredientItemLink {
	return {
		ingredientItemId: row.id,
		purchaseItemId,
		ingredientId: row.ingredient_id,
		unitContentQuantity: row.unit_content_quantity,
	}
}

/**
 * Candidatos de um item: vínculo pelo GTIN (cEAN, senão cEANTrib, o primeiro que tiver
 * ingredient_item), conteúdo líquido desse GTIN e vínculo pelo mapa do fornecedor. As sugestões
 * começam vazias; quem preenche é a leitura de `resolveSuggestionQuery`.
 */
export function buildMatchCandidates(item: NfeItemForCandidates, index: MatchCandidateIndex): NfeMatchCandidates {
	const effectiveGtin = pickLinkedGtin(item.gtin, index.linkByGtin) ?? pickLinkedGtin(item.gtin_trib, index.linkByGtin)
	const gtinLinkRow = getOrNull(index.linkByGtin, effectiveGtin)
	const supplierMapRow = getOrNull(index.mapByCode, item.supplier_code)
	const supplierLinkRow = getOrNull(index.linkById, supplierMapRow?.ingredient_item_id)

	return {
		gtinLink: gtinLinkRow ? toIngredientItemLink(gtinLinkRow, gtinLinkRow.purchase_item_id) : null,
		gtinNetContent: getOrNull(index.gtinEntityByGtin, effectiveGtin)?.net_content ?? null,
		supplierMapLink: supplierLinkRow
			? toIngredientItemLink(supplierLinkRow, supplierLinkRow.purchase_item_id ?? supplierMapRow?.purchase_item_id ?? null)
			: null,
		supplierMapPurchaseItemId: supplierMapRow?.purchase_item_id ?? null,
		suggestionPurchaseItemIds: [],
	}
}

/** Sugestões (trigram + brick GPC) só quando nada acima resolveu e o item tem descrição. */
export function resolveSuggestionQuery(
	item: Pick<NfeItemForCandidates, "gtin" | "description">,
	candidates: NfeMatchCandidates,
	gtinEntityByGtin: ReadonlyMap<string, GtinEntity>
): { description: string; brick: string | null } | null {
	if (candidates.gtinLink || candidates.supplierMapLink || candidates.supplierMapPurchaseItemId || !item.description) return null
	return { description: item.description, brick: getOrNull(gtinEntityByGtin, item.gtin)?.gpc_brick_code ?? null }
}

// ─── Resultado ───────────────────────────────────────────────────────────────

export function buildNfeItemMatchUpdate(
	item: { id: string; nfe_document_id: string; n_item: number },
	result: NfeMatchResult,
	updatedAt: string
): TableInsert<"inventory", "nfe_item"> {
	return {
		id: item.id,
		nfe_document_id: item.nfe_document_id,
		n_item: item.n_item,
		match_status: result.status,
		ingredient_item_id: result.ingredientItemId,
		purchase_item_id: result.purchaseItemId,
		ingredient_id: result.ingredientId,
		matched_qty_base: result.matchedQtyBase,
		updated_at: updatedAt,
	}
}

export function countMatchStatuses(statuses: readonly NfeMatchStatus[]): { matched: number; review: number; noMatch: number } {
	let matched = 0
	let review = 0
	let noMatch = 0
	for (const status of statuses) {
		if (status === "matched") matched++
		else if (status === "review") review++
		else noMatch++
	}
	return { matched, review, noMatch }
}

/** A nota só fica `matched` com TODOS os itens casados. */
export function resolveNfeDocumentStatus(matched: number, total: number): "matched" | "imported" {
	return matched === total ? "matched" : "imported"
}

// ─── Resolução manual ────────────────────────────────────────────────────────

/** Campos do item resolvido à mão a partir do SKU escolhido (ou só do item de compra, sem SKU). */
export function resolveManualLinkFields(
	link: IngredientItemLinkRow | null,
	requestedPurchaseItemId: string | null | undefined
): { ingredientItemId: string | null; purchaseItemId: string | null; perPackage: number | null; ingredientId: string | null } {
	return {
		ingredientItemId: link?.id ?? null,
		purchaseItemId: link?.purchase_item_id ?? requestedPurchaseItemId ?? null,
		perPackage: link?.unit_content_quantity ?? null,
		ingredientId: link?.ingredient_id ?? null,
	}
}

/** Embalagem × quantidade comercial; sem conversão positiva dos dois lados, null (item fica em review). */
export function computeManualMatchedQty(perPackage: number | null, commercialQty: number | null): number | null {
	return perPackage != null && perPackage > 0 && commercialQty != null && commercialQty > 0 ? commercialQty * perPackage : null
}

/**
 * Insumo padrão do item de compra, só quando há UM: há item de compra que é "padrão" de 16 insumos
 * e escolher o primeiro seria sortear o estoque.
 */
export function pickSingleDefaultIngredient(defaultLinks: ReadonlyArray<{ ingredient_id: string | null }> | null | undefined): string | null {
	return defaultLinks?.length === 1 ? (defaultLinks[0].ingredient_id ?? null) : null
}
