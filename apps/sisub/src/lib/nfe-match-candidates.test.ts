import { describe, expect, it } from "vitest"
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
	type MatchCandidateIndex,
	pickSingleDefaultIngredient,
	resolveManualLinkFields,
	resolveNfeDocumentStatus,
	resolveSuggestionQuery,
	type SupplierMapRow,
} from "@/lib/nfe-match-candidates"

const link = (id: string, overrides: Partial<IngredientItemLinkRow> = {}): IngredientItemLinkRow => ({
	id,
	gtin: null,
	purchase_item_id: `pi-${id}`,
	ingredient_id: `ing-${id}`,
	unit_content_quantity: 5,
	...overrides,
})

const nfeItem = (overrides: Partial<{ gtin: string | null; gtin_trib: string | null; supplier_code: string | null; description: string | null }> = {}) => ({
	gtin: null,
	gtin_trib: null,
	supplier_code: null,
	description: "ARROZ 5KG",
	...overrides,
})

const emptyIndex = (): MatchCandidateIndex => ({ linkByGtin: new Map(), gtinEntityByGtin: new Map(), mapByCode: new Map(), linkById: new Map() })

describe("chaves das leituras em lote", () => {
	it("collectNfeGtins junta cEAN e cEANTrib, sem nulos nem repetição, na ordem", () => {
		expect(
			collectNfeGtins([
				{ gtin: "1", gtin_trib: "2" },
				{ gtin: null, gtin_trib: "1" },
				{ gtin: "3", gtin_trib: null },
			])
		).toEqual(["1", "2", "3"])
	})

	it("listUnseenGtins: só cEAN desconhecido, um por GTIN, posição da primeira e dados da última", () => {
		const rows = listUnseenGtins(
			[
				{ gtin: "A", description: "primeira", ncm: "1" },
				{ gtin: "B", description: "conhecido", ncm: null },
				{ gtin: null, description: "sem gtin", ncm: null },
				{ gtin: "C", description: "c", ncm: null },
				{ gtin: "A", description: "última", ncm: "2" },
			],
			new Map([["B", {}]])
		)
		expect(rows).toEqual([
			{ gtin: "A", description: "última", ncm: "2", source: "nfe" },
			{ gtin: "C", description: "c", ncm: null, source: "nfe" },
		])
	})

	it("listUnseenGtins vazio quando tudo é conhecido", () => {
		expect(listUnseenGtins([{ gtin: "A", description: null, ncm: null }], new Map([["A", 1]]))).toEqual([])
	})

	it("collectSupplierCodes e collectSupplierMapItemIds tiram nulos e repetidos", () => {
		expect(collectSupplierCodes([{ supplier_code: "X" }, { supplier_code: null }, { supplier_code: "X" }, { supplier_code: "Y" }])).toEqual(["X", "Y"])
		const map = new Map<string, SupplierMapRow>([
			["X", { ingredient_item_id: "ii1", purchase_item_id: null }],
			["Y", { ingredient_item_id: null, purchase_item_id: "pi" }],
			["Z", { ingredient_item_id: "ii1", purchase_item_id: null }],
		])
		expect(collectSupplierMapItemIds(map)).toEqual(["ii1"])
	})
})

describe("buildMatchCandidates", () => {
	it("sem nada indexado: tudo nulo e sugestões vazias", () => {
		expect(buildMatchCandidates(nfeItem({ gtin: "1", supplier_code: "X" }), emptyIndex())).toEqual({
			gtinLink: null,
			gtinNetContent: null,
			supplierMapLink: null,
			supplierMapPurchaseItemId: null,
			suggestionPurchaseItemIds: [],
		})
	})

	it("cEAN com vínculo vence o cEANTrib; conteúdo líquido é o do GTIN efetivo", () => {
		const index = emptyIndex()
		;(index.linkByGtin as Map<string, IngredientItemLinkRow>).set("1", link("a")).set("2", link("b"))
		;(index.gtinEntityByGtin as Map<string, GtinEntity>)
			.set("1", { net_content: 500, gpc_brick_code: null })
			.set("2", { net_content: 900, gpc_brick_code: null })
		const candidates = buildMatchCandidates(nfeItem({ gtin: "1", gtin_trib: "2" }), index)
		expect(candidates.gtinLink).toEqual({ ingredientItemId: "a", purchaseItemId: "pi-a", ingredientId: "ing-a", unitContentQuantity: 5 })
		expect(candidates.gtinNetContent).toBe(500)
	})

	it("cEAN sem vínculo cai no cEANTrib", () => {
		const index = emptyIndex()
		;(index.linkByGtin as Map<string, IngredientItemLinkRow>).set("2", link("b", { purchase_item_id: null }))
		;(index.gtinEntityByGtin as Map<string, GtinEntity>).set("1", { net_content: 1, gpc_brick_code: null })
		const candidates = buildMatchCandidates(nfeItem({ gtin: "1", gtin_trib: "2" }), index)
		expect(candidates.gtinLink).toEqual({ ingredientItemId: "b", purchaseItemId: null, ingredientId: "ing-b", unitContentQuantity: 5 })
		// GTIN efetivo sem entidade no catálogo: sem conteúdo líquido
		expect(candidates.gtinNetContent).toBeNull()
	})

	it("entidade com conteúdo nulo dá null", () => {
		const index = emptyIndex()
		;(index.linkByGtin as Map<string, IngredientItemLinkRow>).set("1", link("a"))
		;(index.gtinEntityByGtin as Map<string, GtinEntity>).set("1", { net_content: null, gpc_brick_code: "B" })
		expect(buildMatchCandidates(nfeItem({ gtin: "1" }), index).gtinNetContent).toBeNull()
	})

	it("mapa do fornecedor com SKU: o item de compra do SKU vence o do mapa", () => {
		const index = emptyIndex()
		;(index.mapByCode as Map<string, SupplierMapRow>).set("X", { ingredient_item_id: "s", purchase_item_id: "pi-mapa" })
		;(index.linkById as Map<string, IngredientItemLinkRow>).set("s", link("s"))
		const candidates = buildMatchCandidates(nfeItem({ supplier_code: "X" }), index)
		expect(candidates.supplierMapLink).toEqual({ ingredientItemId: "s", purchaseItemId: "pi-s", ingredientId: "ing-s", unitContentQuantity: 5 })
		expect(candidates.supplierMapPurchaseItemId).toBe("pi-mapa")
	})

	it("SKU sem item de compra herda o do mapa; e cai em null quando nenhum tem", () => {
		const index = emptyIndex()
		;(index.mapByCode as Map<string, SupplierMapRow>)
			.set("X", { ingredient_item_id: "s", purchase_item_id: "pi-mapa" })
			.set("Y", { ingredient_item_id: "s", purchase_item_id: null })
		;(index.linkById as Map<string, IngredientItemLinkRow>).set("s", link("s", { purchase_item_id: null }))
		expect(buildMatchCandidates(nfeItem({ supplier_code: "X" }), index).supplierMapLink?.purchaseItemId).toBe("pi-mapa")
		const y = buildMatchCandidates(nfeItem({ supplier_code: "Y" }), index)
		expect(y.supplierMapLink?.purchaseItemId).toBeNull()
		expect(y.supplierMapPurchaseItemId).toBeNull()
	})

	it("mapa só com item de compra (SKU ausente ou excluído): identifica mas não converte", () => {
		const index = emptyIndex()
		;(index.mapByCode as Map<string, SupplierMapRow>)
			.set("X", { ingredient_item_id: null, purchase_item_id: "pi" })
			.set("Z", { ingredient_item_id: "apagado", purchase_item_id: "pi2" })
		expect(buildMatchCandidates(nfeItem({ supplier_code: "X" }), index)).toMatchObject({ supplierMapLink: null, supplierMapPurchaseItemId: "pi" })
		expect(buildMatchCandidates(nfeItem({ supplier_code: "Z" }), index)).toMatchObject({ supplierMapLink: null, supplierMapPurchaseItemId: "pi2" })
	})
})

describe("resolveSuggestionQuery", () => {
	const empty = buildMatchCandidates(nfeItem(), emptyIndex())
	const entities = new Map<string, GtinEntity>([["1", { net_content: null, gpc_brick_code: "10000025" }]])

	it("sem candidato e com descrição: consulta, com o brick do cEAN", () => {
		expect(resolveSuggestionQuery({ gtin: "1", description: "ARROZ" }, empty, entities)).toEqual({ description: "ARROZ", brick: "10000025" })
	})

	it("cEAN fora do catálogo ou ausente: brick null", () => {
		expect(resolveSuggestionQuery({ gtin: "9", description: "ARROZ" }, empty, entities)).toEqual({ description: "ARROZ", brick: null })
		expect(resolveSuggestionQuery({ gtin: null, description: "ARROZ" }, empty, entities)).toEqual({ description: "ARROZ", brick: null })
	})

	it("sem descrição, ou com qualquer candidato, não consulta", () => {
		const linkCandidate = { ingredientItemId: "a", purchaseItemId: null, ingredientId: null, unitContentQuantity: null }
		expect(resolveSuggestionQuery({ gtin: "1", description: null }, empty, entities)).toBeNull()
		expect(resolveSuggestionQuery({ gtin: "1", description: "" }, empty, entities)).toBeNull()
		expect(resolveSuggestionQuery({ gtin: "1", description: "X" }, { ...empty, gtinLink: linkCandidate }, entities)).toBeNull()
		expect(resolveSuggestionQuery({ gtin: "1", description: "X" }, { ...empty, supplierMapLink: linkCandidate }, entities)).toBeNull()
		expect(resolveSuggestionQuery({ gtin: "1", description: "X" }, { ...empty, supplierMapPurchaseItemId: "pi" }, entities)).toBeNull()
	})
})

describe("resultado do matching", () => {
	it("buildNfeItemMatchUpdate copia a decisão para a linha do upsert", () => {
		expect(
			buildNfeItemMatchUpdate(
				{ id: "i", nfe_document_id: "d", n_item: 3 },
				{ status: "matched", ingredientItemId: "ii", purchaseItemId: "pi", ingredientId: "ing", matchedQtyBase: 50 },
				"2026-10-13T00:00:00.000Z"
			)
		).toEqual({
			id: "i",
			nfe_document_id: "d",
			n_item: 3,
			match_status: "matched",
			ingredient_item_id: "ii",
			purchase_item_id: "pi",
			item_id: "ing",
			matched_qty_base: 50,
			updated_at: "2026-10-13T00:00:00.000Z",
		})
	})

	it("countMatchStatuses conta cada situação", () => {
		expect(countMatchStatuses(["matched", "review", "no_match", "matched", "no_match", "no_match"])).toEqual({ matched: 2, review: 1, noMatch: 3 })
		expect(countMatchStatuses([])).toEqual({ matched: 0, review: 0, noMatch: 0 })
	})

	it("resolveNfeDocumentStatus só é matched com todos casados", () => {
		expect(resolveNfeDocumentStatus(3, 3)).toBe("matched")
		expect(resolveNfeDocumentStatus(2, 3)).toBe("imported")
	})
})

describe("resolução manual", () => {
	it("resolveManualLinkFields com SKU", () => {
		expect(resolveManualLinkFields(link("a", { unit_content_quantity: 2 }), "outro")).toEqual({
			ingredientItemId: "a",
			purchaseItemId: "pi-a",
			perPackage: 2,
			ingredientId: "ing-a",
		})
	})

	it("resolveManualLinkFields: SKU sem item de compra herda o pedido", () => {
		expect(resolveManualLinkFields(link("a", { purchase_item_id: null, ingredient_id: null, unit_content_quantity: null }), "pi")).toEqual({
			ingredientItemId: "a",
			purchaseItemId: "pi",
			perPackage: null,
			ingredientId: null,
		})
	})

	it("resolveManualLinkFields sem SKU", () => {
		expect(resolveManualLinkFields(null, "pi")).toEqual({ ingredientItemId: null, purchaseItemId: "pi", perPackage: null, ingredientId: null })
		expect(resolveManualLinkFields(null, undefined)).toEqual({ ingredientItemId: null, purchaseItemId: null, perPackage: null, ingredientId: null })
	})

	it("computeManualMatchedQty exige embalagem e quantidade positivas", () => {
		expect(computeManualMatchedQty(5, 4)).toBe(20)
		expect(computeManualMatchedQty(null, 4)).toBeNull()
		expect(computeManualMatchedQty(0, 4)).toBeNull()
		expect(computeManualMatchedQty(5, null)).toBeNull()
		expect(computeManualMatchedQty(5, 0)).toBeNull()
	})

	it("pickSingleDefaultIngredient só com um insumo padrão", () => {
		expect(pickSingleDefaultIngredient([{ ingredient_id: "ing" }])).toBe("ing")
		expect(pickSingleDefaultIngredient([{ ingredient_id: null }])).toBeNull()
		expect(pickSingleDefaultIngredient([{ ingredient_id: "a" }, { ingredient_id: "b" }])).toBeNull()
		expect(pickSingleDefaultIngredient([])).toBeNull()
		expect(pickSingleDefaultIngredient(null)).toBeNull()
	})
})
