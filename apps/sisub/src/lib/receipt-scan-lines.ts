/**
 * Linhas do recebimento no formato que o casamento de leitura espera (`scanLinesFor`, em
 * `receiving.fn.ts`): o que a NOTA declara, o que o CATÁLOGO conhece e a hierarquia de embalagem.
 *
 * As leituras ficam na fn; aqui só se cruza o que ela leu. Fica fora de `receiving.fn.ts` porque
 * teste unitário não importa `@/server/*`.
 */

import type { ReceiptLineForScan } from "@iefa/sisub-domain/operations"

export interface ScanInvoiceItem {
	gtin: string | null
	gtin_trib: string | null
	commercial_qty: number | null
	taxable_qty: number | null
}

/** O que a NOTA declara (cEAN, cEANTrib, qCom, qTrib), por item da nota. */
export function indexInvoiceItems(items: ReadonlyArray<ScanInvoiceItem & { id: string }> | null): Map<string, ScanInvoiceItem> {
	const nfeById = new Map<string, ScanInvoiceItem>()
	for (const item of items ?? []) nfeById.set(item.id, item)
	return nfeById
}

/**
 * O que o CATÁLOGO conhece, por SKU: o GTIN do SKU primeiro, depois os aliases aprendidos na
 * operação, na ordem em que vieram.
 */
export function collectCatalogGtinsBySku(
	skus: ReadonlyArray<{ id: string; gtin: string | null }> | null,
	aliases: ReadonlyArray<{ gtin: string; ingredient_item_id: string }> | null
): Map<string, string[]> {
	const catalogByItem = new Map<string, string[]>()
	for (const sku of skus ?? []) {
		if (sku.gtin) catalogByItem.set(sku.id, [sku.gtin])
	}
	for (const alias of aliases ?? []) {
		catalogByItem.set(alias.ingredient_item_id, [...(catalogByItem.get(alias.ingredient_item_id) ?? []), alias.gtin])
	}
	return catalogByItem
}

/** Os GTINs da hierarquia de embalagem ligados aos conhecidos do item e que ele ainda não conhece. */
function findRelatedGtins(gtins: readonly string[], nodes: ReadonlyArray<{ gtin: string; parent_gtin: string | null }>): string[] {
	const related: string[] = []
	for (const node of nodes) {
		const isChildOfKnown = node.parent_gtin != null && gtins.includes(node.parent_gtin)
		const isParentOfKnown = gtins.includes(node.gtin) && node.parent_gtin != null
		if (isChildOfKnown && !gtins.includes(node.gtin)) related.push(node.gtin)
		if (isParentOfKnown && node.parent_gtin != null && !gtins.includes(node.parent_gtin)) related.push(node.parent_gtin)
	}
	return related
}

/** Hierarquia de embalagem: caixa ↔ unidade do mesmo produto, por SKU. Item sem parente fica fora. */
export function collectHierarchyGtinsBySku(
	catalogByItem: ReadonlyMap<string, string[]>,
	hierarchy: ReadonlyArray<{ gtin: string; parent_gtin: string | null }> | null
): Map<string, string[]> {
	const nodes = hierarchy ?? []
	const hierarchyByItem = new Map<string, string[]>()
	for (const [itemId, gtins] of catalogByItem) {
		const related = findRelatedGtins(gtins, nodes)
		if (related.length > 0) hierarchyByItem.set(itemId, [...new Set(related)])
	}
	return hierarchyByItem
}

export interface ScanReceiptRow {
	id: string
	nfe_item_id: string | null
	ingredient_item_id: string | null
	invoiced_qty_base: number | null
	received_qty_base: number
}

function numberOrNull(value: number | null | undefined): number | null {
	return value != null ? Number(value) : null
}

function collectGtins(itemId: string | null, bySku: ReadonlyMap<string, string[]>): string[] {
	return itemId ? (bySku.get(itemId) ?? []) : []
}

export function toScanLine(
	row: ScanReceiptRow,
	nfeById: ReadonlyMap<string, ScanInvoiceItem>,
	catalogByItem: ReadonlyMap<string, string[]>,
	hierarchyByItem: ReadonlyMap<string, string[]>
): ReceiptLineForScan {
	const nfe = row.nfe_item_id ? nfeById.get(row.nfe_item_id) : undefined
	return {
		receiptItemId: row.id,
		invoiceGtin: nfe?.gtin ?? null,
		invoiceGtinTrib: nfe?.gtin_trib ?? null,
		catalogGtins: collectGtins(row.ingredient_item_id, catalogByItem),
		hierarchyGtins: collectGtins(row.ingredient_item_id, hierarchyByItem),
		commercialQty: numberOrNull(nfe?.commercial_qty),
		taxableQty: numberOrNull(nfe?.taxable_qty),
		invoicedQtyBase: numberOrNull(row.invoiced_qty_base),
		confirmedQtyBase: Number(row.received_qty_base),
	} satisfies ReceiptLineForScan
}
