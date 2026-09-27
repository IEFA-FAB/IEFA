import { describe, expect, test } from "bun:test"
import { deprecationHeaders, toLegacyAnnexKeys, toLegacyAnnexResponse, withLegacyResearchFields } from "./legacy-annex.ts"

// Alias depreciado do caminho antigo do anexo quantitativo (design D7 de
// `sisub-ubiquitous-language`): some com o contract 20260927050000, junto com este teste.
describe("alias depreciado do anexo quantitativo", () => {
	test("o corpo volta com as chaves do contrato antigo, em qualquer profundidade", () => {
		const body = {
			researchId: "r1",
			quantityEstimateId: "q1",
			items: [{ quantityEstimateItemId: "i1", analysis: null }],
			summary: { total: 1 },
		}
		expect(toLegacyAnnexKeys(body)).toEqual({
			researchId: "r1",
			ataId: "q1",
			items: [{ ataItemId: "i1", analysis: null }],
			summary: { total: 1 },
		})
	})

	test("os cabeçalhos apontam o sucessor", () => {
		expect(deprecationHeaders("/api/admin/price-research/quantity-estimates/q1")).toEqual({
			Deprecation: "true",
			Link: '</api/admin/price-research/quantity-estimates/q1>; rel="successor-version"',
		})
	})

	test("a resposta mantém o status e ganha os cabeçalhos de depreciação", async () => {
		const original = Response.json({ error: "Anexo quantitativo não encontrado" }, { status: 404 })
		const legacy = await toLegacyAnnexResponse(original, "/api/admin/price-research/quantity-estimates/q1")
		expect(legacy.status).toBe(404)
		expect(legacy.headers.get("Deprecation")).toBe("true")
		expect(legacy.headers.get("Link")).toContain("/quantity-estimates/q1")
		expect(await legacy.json()).toEqual({ error: "Anexo quantitativo não encontrado" })
	})

	test("a pesquisa devolve o campo antigo ao lado do renomeado, no cabeçalho e nos itens", () => {
		const research = { id: "r1", quantity_estimate_id: "q1", items: [{ id: "i1", quantity_estimate_item_id: "e1", samples: [] }] }
		expect(withLegacyResearchFields(research) as unknown).toEqual({
			id: "r1",
			quantity_estimate_id: "q1",
			procurement_list_id: "q1",
			items: [{ id: "i1", quantity_estimate_item_id: "e1", procurement_list_item_id: "e1", samples: [] }],
		})
	})
})
