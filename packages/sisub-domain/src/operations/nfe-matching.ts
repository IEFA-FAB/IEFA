/**
 * Pipeline de correlação item de NF-e → insumo (Fase 2c do estoque).
 *
 * Ordem determinística (espelha o padrão catmat_match_status):
 *   1. GTIN (cEAN/cEANTrib) → ingredient_item.gtin           → matched*
 *   2. (CNPJ emitente, cProd) → supplier_product_map          → matched*
 *   3. Sugestões por NCM/brick GPC/similaridade de descrição  → review
 *   4. Nada                                                   → no_match
 *
 * (*) REGRA DURA: item sem conversão resolvível NUNCA fica `matched`.
 * Conversão = unit_content_quantity do ingredient_item, com fallback no
 * conteúdo líquido do GTIN. `uCom`/`qCom` da nota: qCom conta embalagens;
 * uCom é texto livre do emissor e jamais entra na conversão.
 *
 * Este módulo é PURO: o chamador (server fn) busca os candidatos no banco e
 * entrega aqui; a decisão e a matemática ficam testáveis sem DB.
 */

export interface NfeItemForMatch {
	gtin: string | null
	gtinTrib: string | null
	supplierCode: string | null
	commercialQty: number | null
}

export interface IngredientItemLink {
	ingredientItemId: string
	purchaseItemId: string | null
	ingredientId: string | null
	/** Conteúdo da embalagem na unidade base do ingrediente (kitchen.ingredient_item.unit_content_quantity). */
	unitContentQuantity: number | null
}

export interface NfeMatchCandidates {
	/** Vínculo via GTIN da nota → kitchen.ingredient_item.gtin (cEAN, senão cEANTrib). */
	gtinLink: IngredientItemLink | null
	/** Conteúdo líquido do GTIN (gs1_integration.gtin.net_content) — fallback de conversão. */
	gtinNetContent: number | null
	/** Vínculo via gs1_integration.supplier_product_map (CNPJ, cProd). */
	supplierMapLink: IngredientItemLink | null
	/** Só purchase_item no mapa (sem ingredient_item) — identifica mas não converte. */
	supplierMapPurchaseItemId: string | null
	/** Candidatos por NCM + brick GPC + trigram, já ranqueados pelo chamador. */
	suggestionPurchaseItemIds: string[]
}

export type NfeMatchStatus = "matched" | "review" | "no_match"

export interface NfeMatchResult {
	status: NfeMatchStatus
	ingredientItemId: string | null
	purchaseItemId: string | null
	ingredientId: string | null
	/** commercialQty × conversão, na unidade base — null quando não-conversível. */
	matchedQtyBase: number | null
}

function convertedQty(item: NfeItemForMatch, link: IngredientItemLink, gtinNetContent: number | null): number | null {
	const perPackage = link.unitContentQuantity ?? gtinNetContent
	if (perPackage == null || perPackage <= 0) return null
	if (item.commercialQty == null || item.commercialQty <= 0) return null
	return item.commercialQty * perPackage
}

export function matchNfeItem(item: NfeItemForMatch, candidates: NfeMatchCandidates): NfeMatchResult {
	// 1) GTIN exato
	if (candidates.gtinLink) {
		const qty = convertedQty(item, candidates.gtinLink, candidates.gtinNetContent)
		return {
			status: qty != null ? "matched" : "review",
			ingredientItemId: candidates.gtinLink.ingredientItemId,
			purchaseItemId: candidates.gtinLink.purchaseItemId,
			ingredientId: candidates.gtinLink.ingredientId,
			matchedQtyBase: qty,
		}
	}

	// 2) Mapa de fornecedor (cobre "SEM GTIN")
	if (candidates.supplierMapLink) {
		const qty = convertedQty(item, candidates.supplierMapLink, null)
		return {
			status: qty != null ? "matched" : "review",
			ingredientItemId: candidates.supplierMapLink.ingredientItemId,
			purchaseItemId: candidates.supplierMapLink.purchaseItemId,
			ingredientId: candidates.supplierMapLink.ingredientId,
			matchedQtyBase: qty,
		}
	}
	if (candidates.supplierMapPurchaseItemId) {
		// Identificado, mas sem ingredient_item → sem conversão → nunca matched.
		return {
			status: "review",
			ingredientItemId: null,
			purchaseItemId: candidates.supplierMapPurchaseItemId,
			ingredientId: null,
			matchedQtyBase: null,
		}
	}

	// 3) Sugestões → revisão humana
	if (candidates.suggestionPurchaseItemIds.length > 0) {
		return { status: "review", ingredientItemId: null, purchaseItemId: null, ingredientId: null, matchedQtyBase: null }
	}

	// 4) Nada
	return { status: "no_match", ingredientItemId: null, purchaseItemId: null, ingredientId: null, matchedQtyBase: null }
}
