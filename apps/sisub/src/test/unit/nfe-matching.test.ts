/**
 * Unit — pipeline de correlação item de NF-e → insumo (matchNfeItem).
 * Puro (sem DB). Regra dura sob teste: item sem conversão resolvível NUNCA
 * fica `matched` — e a conversão jamais usa uCom/qCom sozinhos.
 */
import { type IngredientItemLink, matchNfeItem, type NfeItemForMatch } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"

const item = (overrides: Partial<NfeItemForMatch> = {}): NfeItemForMatch => ({
	gtin: "07891000315507",
	gtinTrib: null,
	supplierCode: "ARZ-001",
	commercialQty: 10,
	...overrides,
})

const link = (overrides: Partial<IngredientItemLink> = {}): IngredientItemLink => ({
	ingredientItemId: "ii-1",
	purchaseItemId: "pi-1",
	ingredientId: "ing-1",
	unitContentQuantity: 5,
	...overrides,
})

const noCandidates = {
	gtinLink: null,
	gtinNetContent: null,
	supplierMapLink: null,
	supplierMapPurchaseItemId: null,
	suggestionPurchaseItemIds: [] as string[],
}

describe("matchNfeItem — GTIN exato", () => {
	test("GTIN com unit_content_quantity: matched, 10 fardos × 5 KG = 50 KG", () => {
		const result = matchNfeItem(item(), { ...noCandidates, gtinLink: link() })
		expect(result.status).toBe("matched")
		expect(result.matchedQtyBase).toBe(50)
		expect(result.ingredientItemId).toBe("ii-1")
		expect(result.ingredientId).toBe("ing-1")
	})

	test("sem unit_content_quantity, conteúdo líquido do GTIN é o fallback", () => {
		const result = matchNfeItem(item(), { ...noCandidates, gtinLink: link({ unitContentQuantity: null }), gtinNetContent: 2 })
		expect(result.status).toBe("matched")
		expect(result.matchedQtyBase).toBe(20)
	})

	test("GTIN vinculado mas SEM conversão resolvível → review, nunca matched", () => {
		const result = matchNfeItem(item(), { ...noCandidates, gtinLink: link({ unitContentQuantity: null }) })
		expect(result.status).toBe("review")
		expect(result.matchedQtyBase).toBeNull()
		expect(result.ingredientItemId).toBe("ii-1")
	})

	test("qCom ausente ou zero também bloqueia o matched", () => {
		expect(matchNfeItem(item({ commercialQty: null }), { ...noCandidates, gtinLink: link() }).status).toBe("review")
		expect(matchNfeItem(item({ commercialQty: 0 }), { ...noCandidates, gtinLink: link() }).status).toBe("review")
	})

	test("conversão não-positiva bloqueia o matched", () => {
		const result = matchNfeItem(item(), { ...noCandidates, gtinLink: link({ unitContentQuantity: 0 }) })
		expect(result.status).toBe("review")
	})
})

describe("matchNfeItem — mapa de fornecedor (SEM GTIN)", () => {
	test("mapa com ingredient_item conversível → matched", () => {
		const result = matchNfeItem(item({ gtin: null }), { ...noCandidates, supplierMapLink: link({ unitContentQuantity: 25 }) })
		expect(result.status).toBe("matched")
		expect(result.matchedQtyBase).toBe(250)
	})

	test("mapa só com purchase_item (sem conversão) → review, identifica o purchase_item", () => {
		const result = matchNfeItem(item({ gtin: null }), { ...noCandidates, supplierMapPurchaseItemId: "pi-9" })
		expect(result.status).toBe("review")
		expect(result.purchaseItemId).toBe("pi-9")
		expect(result.matchedQtyBase).toBeNull()
	})

	test("GTIN tem precedência sobre o mapa", () => {
		const result = matchNfeItem(item(), {
			...noCandidates,
			gtinLink: link({ ingredientItemId: "via-gtin" }),
			supplierMapLink: link({ ingredientItemId: "via-mapa" }),
		})
		expect(result.ingredientItemId).toBe("via-gtin")
	})
})

describe("matchNfeItem — sugestões e vazio", () => {
	test("apenas sugestões → review sem ids resolvidos", () => {
		const result = matchNfeItem(item({ gtin: null }), { ...noCandidates, suggestionPurchaseItemIds: ["pi-1", "pi-2"] })
		expect(result.status).toBe("review")
		expect(result.ingredientItemId).toBeNull()
	})

	test("nenhum candidato → no_match", () => {
		const result = matchNfeItem(item({ gtin: null }), noCandidates)
		expect(result.status).toBe("no_match")
	})
})
