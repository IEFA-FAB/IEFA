import { describe, expect, test } from "bun:test"
import { folderChain, indexSegmentRules, resolveSegment, type SegmentRuleInput } from "./segment-resolution.ts"

// Árvore: generos › proteinas › {bovinos, pescados}; generos › bebidas
const PARENT = new Map<string, string | null>([
	["generos", null],
	["proteinas", "generos"],
	["bovinos", "proteinas"],
	["pescados", "proteinas"],
	["bebidas", "generos"],
])
const chain = (leaf: string) => folderChain(leaf, PARENT)
const include = (segmentId: string, target: { folder?: string; item?: string }): SegmentRuleInput => ({
	segmentId,
	mode: "include",
	folderId: target.folder ?? null,
	purchaseItemId: target.item ?? null,
})
const exclude = (segmentId: string, target: { folder?: string; item?: string }): SegmentRuleInput => ({ ...include(segmentId, target), mode: "exclude" })

describe("folderChain", () => {
	test("vai da folha à raiz e para em ciclo", () => {
		expect(chain("bovinos")).toEqual(["bovinos", "proteinas", "generos"])
		const cyclic = new Map<string, string | null>([
			["a", "b"],
			["b", "a"],
		])
		expect(folderChain("a", cyclic)).toEqual(["a", "b"])
		expect(folderChain(null, PARENT)).toEqual([])
	})
})

describe("resolveSegment", () => {
	test("pasta incluída leva as subpastas", () => {
		const rules = indexSegmentRules([include("carnes", { folder: "proteinas" })])
		expect(resolveSegment({ purchaseItemId: "pi-boi", folderChains: [chain("bovinos")] }, rules)).toEqual({ kind: "assigned", segmentId: "carnes" })
	})

	test("item fora de qualquer regra fica sem contratação", () => {
		const rules = indexSegmentRules([include("carnes", { folder: "proteinas" })])
		expect(resolveSegment({ purchaseItemId: "pi-suco", folderChains: [chain("bebidas")] }, rules)).toEqual({ kind: "unassigned" })
		expect(resolveSegment({ purchaseItemId: null, folderChains: [] }, rules)).toEqual({ kind: "unassigned" })
	})

	test("exclusão mais específica tira a subpasta, e outra contratação a pega", () => {
		const rules = indexSegmentRules([
			include("carnes", { folder: "proteinas" }),
			exclude("carnes", { folder: "pescados" }),
			include("congelados", { folder: "pescados" }),
		])
		expect(resolveSegment({ purchaseItemId: "pi-peixe", folderChains: [chain("pescados")] }, rules)).toEqual({
			kind: "assigned",
			segmentId: "congelados",
		})
		expect(resolveSegment({ purchaseItemId: "pi-boi", folderChains: [chain("bovinos")] }, rules)).toEqual({ kind: "assigned", segmentId: "carnes" })
	})

	test("regra mais próxima da folha vence entre contratações", () => {
		const rules = indexSegmentRules([include("generos", { folder: "generos" }), include("carnes", { folder: "proteinas" })])
		expect(resolveSegment({ purchaseItemId: "pi-boi", folderChains: [chain("bovinos")] }, rules)).toEqual({ kind: "assigned", segmentId: "carnes" })
		expect(resolveSegment({ purchaseItemId: "pi-suco", folderChains: [chain("bebidas")] }, rules)).toEqual({ kind: "assigned", segmentId: "generos" })
	})

	test("mesma pasta em duas contratações é conflito", () => {
		const rules = indexSegmentRules([include("carnes", { folder: "pescados" }), include("congelados", { folder: "pescados" })])
		expect(resolveSegment({ purchaseItemId: "pi-peixe", folderChains: [chain("pescados")] }, rules)).toEqual({
			kind: "conflict",
			segmentIds: ["carnes", "congelados"],
		})
	})

	test("insumos do mesmo item em contratações diferentes é conflito", () => {
		const rules = indexSegmentRules([include("carnes", { folder: "bovinos" }), include("congelados", { folder: "pescados" })])
		expect(resolveSegment({ purchaseItemId: "pi-misto", folderChains: [chain("bovinos"), chain("pescados")] }, rules)).toEqual({
			kind: "conflict",
			segmentIds: ["carnes", "congelados"],
		})
	})

	test("parte dos insumos sem contratação: vale a resolvida", () => {
		const rules = indexSegmentRules([include("carnes", { folder: "bovinos" })])
		expect(resolveSegment({ purchaseItemId: "pi", folderChains: [chain("bovinos"), chain("bebidas")] }, rules)).toEqual({
			kind: "assigned",
			segmentId: "carnes",
		})
	})

	test("regra de item de compra decide acima de qualquer pasta", () => {
		const rules = indexSegmentRules([include("carnes", { folder: "proteinas" }), include("bebidas", { item: "pi-boi" })])
		expect(resolveSegment({ purchaseItemId: "pi-boi", folderChains: [chain("bovinos")] }, rules)).toEqual({ kind: "assigned", segmentId: "bebidas" })
	})

	test("item incluído em duas contratações é conflito", () => {
		const rules = indexSegmentRules([include("a", { item: "pi" }), include("b", { item: "pi" })])
		expect(resolveSegment({ purchaseItemId: "pi", folderChains: [] }, rules)).toEqual({ kind: "conflict", segmentIds: ["a", "b"] })
	})

	test("exclusão de item tira a contratação da disputa", () => {
		const rules = indexSegmentRules([include("carnes", { folder: "proteinas" }), exclude("carnes", { item: "pi-boi" })])
		expect(resolveSegment({ purchaseItemId: "pi-boi", folderChains: [chain("bovinos")] }, rules)).toEqual({ kind: "unassigned" })
	})

	test("empate entre inclusão e exclusão na mesma pasta: a exclusão vence", () => {
		const rules = indexSegmentRules([include("carnes", { folder: "proteinas" }), exclude("carnes", { folder: "proteinas" })])
		expect(resolveSegment({ purchaseItemId: "pi-boi", folderChains: [chain("bovinos")] }, rules)).toEqual({ kind: "unassigned" })
	})
})
