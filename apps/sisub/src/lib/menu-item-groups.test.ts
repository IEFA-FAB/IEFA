import { describe, expect, test } from "vitest"
import { groupMenuItems, isMenuItemGroup, MENU_ITEM_GROUPS, menuItemGroupOrder, UNGROUPED_KEY } from "./menu-item-groups"

describe("isMenuItemGroup", () => {
	test("aceita todos os grupos canônicos", () => {
		for (const g of MENU_ITEM_GROUPS) expect(isMenuItemGroup(g)).toBe(true)
	})

	test("rejeita valor desconhecido, null e undefined", () => {
		expect(isMenuItemGroup("entrada")).toBe(false)
		expect(isMenuItemGroup(null)).toBe(false)
		expect(isMenuItemGroup(undefined)).toBe(false)
		expect(isMenuItemGroup("")).toBe(false)
	})
})

describe("menuItemGroupOrder", () => {
	test("segue a ordem de leitura declarada em MENU_ITEM_GROUPS", () => {
		expect(menuItemGroupOrder("prato_principal")).toBe(0)
		expect(menuItemGroupOrder("sobremesa")).toBe(MENU_ITEM_GROUPS.length - 1)
		expect(menuItemGroupOrder("prato_principal")).toBeLessThan(menuItemGroupOrder("bebida"))
	})

	test("itens sem grupo (legado/null/desconhecido) vão para o fim", () => {
		const last = MENU_ITEM_GROUPS.length
		expect(menuItemGroupOrder(null)).toBe(last)
		expect(menuItemGroupOrder(undefined)).toBe(last)
		expect(menuItemGroupOrder("xpto")).toBe(last)
	})
})

describe("groupMenuItems", () => {
	test("ordena grupos pela ordem canônica, independente da ordem de entrada", () => {
		const items = [
			{ id: "d", item_group: "sobremesa", sort_order: 0 },
			{ id: "p", item_group: "prato_principal", sort_order: 0 },
			{ id: "b", item_group: "bebida", sort_order: 0 },
		]
		const groups = groupMenuItems(items)
		expect(groups.map((g) => g.key)).toEqual(["prato_principal", "bebida", "sobremesa"])
	})

	test("dentro do grupo ordena por sort_order crescente", () => {
		const items = [
			{ id: "a", item_group: "acompanhamento", sort_order: 2 },
			{ id: "b", item_group: "acompanhamento", sort_order: 0 },
			{ id: "c", item_group: "acompanhamento", sort_order: 1 },
		]
		const [group] = groupMenuItems(items)
		expect(group.items.map((i) => i.id)).toEqual(["b", "c", "a"])
	})

	test("sort_order ausente é tratado como 0 e mantém ordem estável de inserção", () => {
		const items = [
			{ id: "x", item_group: "bebida", sort_order: null },
			{ id: "y", item_group: "bebida", sort_order: undefined },
			{ id: "z", item_group: "bebida", sort_order: 0 },
		]
		const [group] = groupMenuItems(items)
		expect(group.items.map((i) => i.id)).toEqual(["x", "y", "z"])
	})

	test("itens legados sem grupo caem em UNGROUPED_KEY no fim", () => {
		const items = [
			{ id: "u1", item_group: null, sort_order: 0 },
			{ id: "p1", item_group: "prato_principal", sort_order: 0 },
			{ id: "u2", item_group: "invalido", sort_order: 0 },
		]
		const groups = groupMenuItems(items)
		expect(groups.map((g) => g.key)).toEqual(["prato_principal", UNGROUPED_KEY])
		const ungrouped = groups.find((g) => g.key === UNGROUPED_KEY)
		expect(ungrouped?.items.map((i) => i.id)).toEqual(["u1", "u2"])
	})

	test("grupos vazios não aparecem", () => {
		const groups = groupMenuItems([{ id: "p", item_group: "prato_principal", sort_order: 0 }])
		expect(groups).toHaveLength(1)
		expect(groups[0].key).toBe("prato_principal")
	})

	test("lista vazia devolve nenhum grupo", () => {
		expect(groupMenuItems([])).toEqual([])
	})

	test("não muta o array de entrada", () => {
		const items = [
			{ id: "a", item_group: "bebida", sort_order: 2 },
			{ id: "b", item_group: "bebida", sort_order: 1 },
		]
		const snapshot = items.map((i) => i.id)
		groupMenuItems(items)
		expect(items.map((i) => i.id)).toEqual(snapshot)
	})
})
