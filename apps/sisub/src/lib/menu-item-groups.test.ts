import { describe, expect, test } from "vitest"
import { DEFAULT_MENU_GROUPS, groupMenuItems, isMenuItemGroup, menuItemGroupLabel, menuItemGroupOrder, UNGROUPED_KEY } from "./menu-item-groups"

/** Conjunto do café: existe para provar que a ordem de leitura é do CONJUNTO, não global. */
const CAFE = [
	{ key: "pao", label: "Pães" },
	{ key: "proteina", label: "Frios e ovos" },
	{ key: "fruta", label: "Frutas" },
	{ key: "bebida", label: "Bebidas" },
]

describe("isMenuItemGroup", () => {
	test("reconhece as chaves do conjunto informado", () => {
		for (const g of CAFE) expect(isMenuItemGroup(g.key, CAFE)).toBe(true)
	})

	test("chave de OUTRO conjunto não pertence a este", () => {
		// O mesmo valor é válido no almoço e órfão no café: é essa a diferença que
		// a lista fixa antiga não sabia fazer.
		expect(isMenuItemGroup("guarnicao", DEFAULT_MENU_GROUPS)).toBe(true)
		expect(isMenuItemGroup("guarnicao", CAFE)).toBe(false)
	})

	test("rejeita valor inexistente, nulo ou vazio", () => {
		expect(isMenuItemGroup("entrada", CAFE)).toBe(false)
		expect(isMenuItemGroup(null, CAFE)).toBe(false)
		expect(isMenuItemGroup(undefined, CAFE)).toBe(false)
		expect(isMenuItemGroup("", CAFE)).toBe(false)
	})
})

describe("menuItemGroupOrder", () => {
	test("segue a ordem de leitura do conjunto", () => {
		expect(menuItemGroupOrder("pao", CAFE)).toBe(0)
		expect(menuItemGroupOrder("bebida", CAFE)).toBe(CAFE.length - 1)
		expect(menuItemGroupOrder("pao", CAFE)).toBeLessThan(menuItemGroupOrder("fruta", CAFE))
	})

	test("o almoço abre por salada — o grupo que não existia", () => {
		expect(menuItemGroupOrder("salada", DEFAULT_MENU_GROUPS)).toBe(0)
	})

	test("sem grupo, ou fora do conjunto, vai para o fim", () => {
		expect(menuItemGroupOrder(null, CAFE)).toBe(CAFE.length)
		expect(menuItemGroupOrder(undefined, CAFE)).toBe(CAFE.length)
		expect(menuItemGroupOrder("guarnicao", CAFE)).toBe(CAFE.length)
	})
})

describe("menuItemGroupLabel", () => {
	test("usa o rótulo do conjunto", () => {
		expect(menuItemGroupLabel("pao", CAFE)).toBe("Pães")
	})

	test("chave fora do conjunto vira rótulo legível, não 'sem grupo'", () => {
		expect(menuItemGroupLabel("prato_principal", CAFE)).toBe("Prato principal")
	})
})

describe("groupMenuItems", () => {
	test("agrupa na ordem do conjunto", () => {
		const items = [
			{ id: "a", item_group: "bebida", sort_order: 0 },
			{ id: "b", item_group: "pao", sort_order: 0 },
		]
		expect(groupMenuItems(items, CAFE).map((g) => g.key)).toEqual(["pao", "bebida"])
	})

	test("ordena por sort_order dentro do grupo", () => {
		const items = [
			{ id: "segundo", item_group: "pao", sort_order: 1 },
			{ id: "primeiro", item_group: "pao", sort_order: 0 },
		]
		const [group] = groupMenuItems(items, CAFE)
		expect(group.items.map((i) => i.id)).toEqual(["primeiro", "segundo"])
	})

	test("chave fora do conjunto ganha coluna própria, antes de 'sem grupo'", () => {
		// O item classificado como guarnição num café não pode ser confundido com
		// item que ninguém classificou: são situações diferentes e o conserto é outro.
		const items = [
			{ id: "orfao", item_group: "guarnicao", sort_order: 0 },
			{ id: "solto", item_group: null, sort_order: 0 },
			{ id: "pao", item_group: "pao", sort_order: 0 },
		]
		const groups = groupMenuItems(items, CAFE)
		expect(groups.map((g) => g.key)).toEqual(["pao", "guarnicao", UNGROUPED_KEY])
		expect(groups[1].label).toBe("Guarnicao")
	})

	test("grupo vazio não vira seção", () => {
		const groups = groupMenuItems([{ id: "p", item_group: "pao", sort_order: 0 }], CAFE)
		expect(groups).toHaveLength(1)
	})

	test("lista vazia devolve nenhum grupo", () => {
		expect(groupMenuItems([], CAFE)).toEqual([])
	})

	test("não muta o array recebido", () => {
		const items = [
			{ id: "b", item_group: "pao", sort_order: 1 },
			{ id: "a", item_group: "pao", sort_order: 0 },
		]
		groupMenuItems(items, CAFE)
		expect(items.map((i) => i.id)).toEqual(["b", "a"])
	})
})
