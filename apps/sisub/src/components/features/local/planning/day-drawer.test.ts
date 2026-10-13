import { describe, expect, test } from "vitest"
import type { RecipeVersionRef } from "@/lib/recipe-versions"
import { buildDayMeals, collectOutdatedById, findSnackMenu, formatDayTitle, replaceRecipeDescription, toIsoDate } from "./day-drawer"

const recipe = (over: Partial<RecipeVersionRef> = {}): RecipeVersionRef => ({
	id: "r1",
	name: "Arroz",
	version: 1,
	kitchen_id: 7,
	base_recipe_id: null,
	...over,
})

describe("toIsoDate e formatDayTitle", () => {
	test("sem dia aberto, vazio", () => {
		expect(toIsoDate(null)).toBe("")
		expect(formatDayTitle(null)).toBe("")
	})
	test("data local, em pt-BR", () => {
		const date = new Date(2026, 9, 13)
		expect(toIsoDate(date)).toBe("2026-10-13")
		expect(formatDayTitle(date)).toBe("terça-feira, 13 de outubro")
	})
})

describe("collectOutdatedById", () => {
	const v1 = recipe()
	const v2 = recipe({ id: "r1-v2", version: 2, base_recipe_id: "r1" })
	const other = recipe({ id: "r9", name: "Feijão" })

	test("sem cardápio nem catálogo, vazio", () => {
		expect(collectOutdatedById(undefined, undefined).size).toBe(0)
	})

	test("ficha antiga aparece uma vez, com o uso somado; item sem ficha e menu sem itens são ignorados", () => {
		const menus = [
			{ meal_type_id: "mt1", menu_items: [{ recipe_origin: v1 }, { recipe_origin: null }, { recipe_origin: other }] },
			{ meal_type_id: "mt2", menu_items: [{ recipe_origin: v1 }] },
			{ meal_type_id: "mt3", menu_items: null },
		]
		const out = collectOutdatedById(menus, [v2, other])
		expect([...out.keys()]).toEqual(["r1"])
		expect(out.get("r1")).toEqual({ current: v1, latest: v2, usageCount: 2 })
	})

	test("ficha já na versão vencedora não é antiga", () => {
		expect(collectOutdatedById([{ meal_type_id: "mt1", menu_items: [{ recipe_origin: v2 }] }], [v2]).size).toBe(0)
	})
})

describe("buildDayMeals", () => {
	const mealTypes = [{ id: "mt1" }, { id: "mt2" }]
	test("uma linha por tipo de refeição, com o cardápio quando houver", () => {
		const lunch = { meal_type_id: "mt1", id: "d1" }
		expect(buildDayMeals(mealTypes, [lunch])).toEqual([
			{ mealType: { id: "mt1" }, menu: lunch },
			{ mealType: { id: "mt2" }, menu: undefined },
		])
		expect(buildDayMeals(mealTypes, undefined)).toEqual([
			{ mealType: { id: "mt1" }, menu: undefined },
			{ mealType: { id: "mt2" }, menu: undefined },
		])
	})
	test("sem tipos de refeição, lista vazia", () => {
		expect(buildDayMeals(undefined, [{ meal_type_id: "mt1" }])).toEqual([])
		expect(buildDayMeals([], [{ meal_type_id: "mt1" }])).toEqual([])
	})
})

describe("findSnackMenu", () => {
	const menus = [{ meal_type_id: "mt1" }, { meal_type_id: "snack" }]
	test("só com o tipo de sistema carregado", () => {
		expect(findSnackMenu({ id: "snack" }, menus)).toBe(menus[1])
		expect(findSnackMenu({ id: "x" }, menus)).toBeUndefined()
		expect(findSnackMenu(undefined, menus)).toBeUndefined()
		expect(findSnackMenu(null, menus)).toBeUndefined()
		expect(findSnackMenu({ id: "snack" }, undefined)).toBeUndefined()
	})
})

describe("replaceRecipeDescription", () => {
	test("nome da preparação trocada, ou o genérico", () => {
		expect(replaceRecipeDescription({ recipe: { name: "Frango" } } as never)).toBe("No lugar de “Frango”. Porções, grupo e origem ficam.")
		expect(replaceRecipeDescription({ recipe: null } as never)).toBe("No lugar de “preparação”. Porções, grupo e origem ficam.")
		expect(replaceRecipeDescription({ recipe: {} } as never)).toBe("No lugar de “preparação”. Porções, grupo e origem ficam.")
		expect(replaceRecipeDescription(null)).toBe("No lugar de “preparação”. Porções, grupo e origem ficam.")
	})
})
