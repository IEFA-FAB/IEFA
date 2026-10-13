import { describe, expect, it } from "vitest"
import type { FlatIngredientTree, Folder, Ingredient, IngredientDialogState, IngredientTreeNode } from "@/types/domain/ingredients"
import { countVisibleNodes, pickEmptyTreeHint, pickFolderToEdit } from "./ingredients-tree-manager-state"

const node = (id: string, type: IngredientTreeNode["type"]): IngredientTreeNode => ({
	id,
	type,
	label: id,
	parentId: null,
	level: 0,
	hasChildren: false,
	data: {} as Folder,
})

const tree = (nodes: IngredientTreeNode[]): FlatIngredientTree => ({
	nodes: [],
	byId: Object.fromEntries(nodes.map((n) => [n.id, n])),
	byParentId: {},
})

describe("countVisibleNodes", () => {
	it("sem árvore: zero", () => {
		expect(countVisibleNodes(null)).toEqual({ folders: 0, ingredients: 0 })
		expect(countVisibleNodes(undefined)).toEqual({ folders: 0, ingredients: 0 })
	})
	it("conta pastas e insumos pelo byId e ignora item de produto", () => {
		const t = tree([node("f1", "folder"), node("f2", "folder"), node("i1", "ingredient"), node("x", "ingredient_item")])
		expect(countVisibleNodes(t)).toEqual({ folders: 2, ingredients: 1 })
	})
	it("usa o byId, não a lista visível (recolhida)", () => {
		const t = tree([node("i1", "ingredient"), node("i2", "ingredient")])
		expect(t.nodes).toHaveLength(0)
		expect(countVisibleNodes(t).ingredients).toBe(2)
	})
})

describe("pickFolderToEdit", () => {
	const folder = { id: "f", parent_id: null, description: "Pasta" } as unknown as Folder
	const ingredient = { id: "i", description: "Arroz" } as unknown as Ingredient
	const state = (over: Partial<IngredientDialogState>): IngredientDialogState => ({ isOpen: true, mode: "edit", type: "folder", ...over })

	it("edição de pasta: devolve a pasta", () => {
		expect(pickFolderToEdit(state({ data: folder }))).toBe(folder)
	})
	it("criação: undefined mesmo com dado", () => {
		expect(pickFolderToEdit(state({ mode: "create", data: folder }))).toBeUndefined()
	})
	it("edição sem dado: undefined", () => {
		expect(pickFolderToEdit(state({ data: undefined }))).toBeUndefined()
	})
	it("edição com dado que não é pasta: undefined", () => {
		expect(pickFolderToEdit(state({ data: ingredient }))).toBeUndefined()
	})
})

describe("pickEmptyTreeHint", () => {
	const texts = { emptyReview: "REVISÃO", emptyGlobalMenu: "CARDÁPIO" }
	it("pendentes de revisão vence tudo", () => {
		expect(pickEmptyTreeHint({ onlyNotReviewed: true, urlSearch: "arroz", onlyGlobalMenu: true }, texts)).toBe("REVISÃO")
	})
	it("com busca, a dica é ajustar a busca (mesmo com recorte do cardápio)", () => {
		expect(pickEmptyTreeHint({ onlyNotReviewed: false, urlSearch: "arroz", onlyGlobalMenu: true }, texts)).toBe("Tente ajustar os filtros de busca")
	})
	it("só o recorte do cardápio global", () => {
		expect(pickEmptyTreeHint({ onlyNotReviewed: false, urlSearch: "", onlyGlobalMenu: true }, texts)).toBe("CARDÁPIO")
	})
	it("sem filtro: sem dica", () => {
		expect(pickEmptyTreeHint({ onlyNotReviewed: false, urlSearch: "", onlyGlobalMenu: false }, texts)).toBeNull()
	})
})
