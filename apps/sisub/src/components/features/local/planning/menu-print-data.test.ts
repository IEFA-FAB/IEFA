import { describe, expect, test } from "vitest"
import { collectPreparationSources, scopeKitchenId } from "./menu-print-data"

type Items = Parameters<typeof collectPreparationSources>[0]
type OutdatedMap = Parameters<typeof collectPreparationSources>[1]

function origin(id: string, extra: Record<string, unknown> = {}) {
	return { recipe_origin: { id, name: `Ficha ${id}`, version: 2, pre_preparation_method: null, preparation_method: null, ...extra } }
}

const items = (...list: unknown[]) => list as unknown as Items
const noOutdated: OutdatedMap = new Map()

describe("scopeKitchenId", () => {
	test("cozinha: o id numérico; global: null", () => {
		expect(scopeKitchenId({ kind: "kitchen", kitchenId: 7, kitchenIdStr: "7" })).toBe(7)
		expect(scopeKitchenId({ kind: "global" })).toBeNull()
	})
})

describe("collectPreparationSources", () => {
	test("item sem origem fica de fora; origem repetida vale a primeira, na ordem dos itens", () => {
		const result = collectPreparationSources(items({ recipe_origin: null }, origin("b"), origin("a"), origin("b", { name: "Outra B" })), noOutdated)
		expect(result.map((s) => [s.id, s.name])).toEqual([
			["b", "Ficha b"],
			["a", "Ficha a"],
		])
	})

	test("nome aparado; vazio, só espaço ou nulo vira o fallback", () => {
		const result = collectPreparationSources(
			items(origin("1", { name: "  Arroz  " }), origin("2", { name: "   " }), origin("3", { name: "" }), origin("4", { name: null })),
			noOutdated
		)
		expect(result.map((s) => s.name)).toEqual(["Arroz", "Preparação sem nome", "Preparação sem nome", "Preparação sem nome"])
	})

	test("versão: nula conta como v1 (zero não: `??`); desatualizada diz a atual", () => {
		const outdated = new Map([["x", { latest: { version: 5 } }]]) as unknown as OutdatedMap
		const result = collectPreparationSources(items(origin("x", { version: 3 }), origin("y", { version: null }), origin("w", { version: 0 })), outdated)
		expect(result.map((s) => s.version)).toEqual(["v3 — desatualizada (atual: v5)", "v1", "v0"])
	})

	test("pré-preparo e preparo aparados; vazio, só espaço ou nulo vira null", () => {
		const result = collectPreparationSources(
			items(
				origin("1", { pre_preparation_method: "  Lavar  ", preparation_method: " Cozinhar " }),
				origin("2", { pre_preparation_method: "  ", preparation_method: "" }),
				origin("3", { pre_preparation_method: null, preparation_method: null })
			),
			noOutdated
		)
		expect(result.map((s) => [s.prePreparation, s.method])).toEqual([
			["Lavar", "Cozinhar"],
			[null, null],
			[null, null],
		])
	})

	test("forma completa da ficha", () => {
		expect(collectPreparationSources(items(origin("z", { preparation_method: "Assar" })), noOutdated)).toEqual([
			{ id: "z", name: "Ficha z", version: "v2", prePreparation: null, method: "Assar" },
		])
	})
})
