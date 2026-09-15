import { describe, expect, test } from "vitest"
import { findOutdatedRecipes, indexLatestByLineage, isSupersededBy, type RecipeVersionRef, replaceRecipeVersions } from "./recipe-versions"

function recipe(overrides: Partial<RecipeVersionRef> & Pick<RecipeVersionRef, "id">): RecipeVersionRef {
	return { name: overrides.id, version: 1, kitchen_id: null, base_recipe_id: null, ...overrides }
}

const root = recipe({ id: "root", version: 1 })
const v2 = recipe({ id: "v2", version: 2, base_recipe_id: "root" })
const v3 = recipe({ id: "v3", version: 3, base_recipe_id: "root", name: "Nome novo" })
const fork = recipe({ id: "fork", version: 1, base_recipe_id: "root", kitchen_id: 7 })
const other = recipe({ id: "other", version: 9 })

describe("isSupersededBy", () => {
	test("maior versão no mesmo escopo substitui", () => {
		expect(isSupersededBy(root, v3)).toBe(true)
		expect(isSupersededBy(v2, v3)).toBe(true)
		expect(isSupersededBy(v3, v2)).toBe(false)
	})

	test("a própria linha não se substitui", () => {
		expect(isSupersededBy(v3, v3)).toBe(false)
	})

	test("linhagens diferentes nunca se substituem, mesmo com versão maior", () => {
		expect(isSupersededBy(root, other)).toBe(false)
	})

	test("fork local sombreia o global independentemente do número", () => {
		expect(isSupersededBy(v3, fork)).toBe(true)
		expect(isSupersededBy(fork, v3)).toBe(false)
	})
})

describe("indexLatestByLineage", () => {
	test("guarda a vencedora de cada linhagem", () => {
		const index = indexLatestByLineage([v2, other, v3, root])
		expect(index.get("root")?.id).toBe("v3")
		expect(index.get("other")?.id).toBe("other")
	})
})

describe("findOutdatedRecipes", () => {
	const recipeById = new Map([root, v2, v3, other].map((r) => [r.id, r]))
	const latest = indexLatestByLineage([v3, other])

	test("lista versões antigas com a mais recente e a contagem de uso", () => {
		const outdated = findOutdatedRecipes(["v2", "other", "root", "v2", "v3"], recipeById, latest)
		expect(outdated.map((o) => [o.current.id, o.latest.id, o.usageCount])).toEqual([
			["v2", "v3", 2],
			["root", "v3", 1],
		])
	})

	test("ignora id sem linha conhecida e linhagem ausente da listagem (excluída)", () => {
		const gone = recipe({ id: "gone", version: 1 })
		const outdated = findOutdatedRecipes(["missing", "gone"], new Map([["gone", gone]]), latest)
		expect(outdated).toEqual([])
	})

	test("item que aponta para versão MAIS NOVA que a da listagem não é desatualizado", () => {
		// v3 excluída: a listagem devolve v2 como vencedora, mas o item continua em v3.
		const outdated = findOutdatedRecipes(["v3"], recipeById, indexLatestByLineage([v2]))
		expect(outdated).toEqual([])
	})
})

describe("replaceRecipeVersions", () => {
	type Item = { day_of_week: number; meal_type_id: string; recipe_id: string; headcount_override: number | null }
	const item = (day: number, meal: string, recipeId: string, headcount: number | null = null): Item => ({
		day_of_week: day,
		meal_type_id: meal,
		recipe_id: recipeId,
		headcount_override: headcount,
	})

	test("troca o recipe_id preservando os demais atributos e a ordem", () => {
		const result = replaceRecipeVersions([item(1, "almoco", "v2", 120), item(1, "almoco", "other")], new Map([["v2", "v3"]]))
		expect(result).toEqual([item(1, "almoco", "v3", 120), item(1, "almoco", "other")])
	})

	test("remove a versão antiga quando a refeição já tem a nova, mantendo o item que já estava nela", () => {
		const result = replaceRecipeVersions([item(1, "almoco", "v2", 80), item(1, "almoco", "v3", 150)], new Map([["v2", "v3"]]))
		expect(result).toEqual([item(1, "almoco", "v3", 150)])
	})

	test("duas versões antigas da mesma linhagem na refeição viram um item só", () => {
		const result = replaceRecipeVersions(
			[item(2, "jantar", "root"), item(2, "jantar", "v2")],
			new Map([
				["root", "v3"],
				["v2", "v3"],
			])
		)
		expect(result).toEqual([item(2, "jantar", "v3")])
	})

	test("a mesma preparação em refeições diferentes é trocada em todas", () => {
		const result = replaceRecipeVersions([item(1, "almoco", "v2"), item(3, "almoco", "v2"), item(1, "jantar", "v2")], new Map([["v2", "v3"]]))
		expect(result.map((i) => i.recipe_id)).toEqual(["v3", "v3", "v3"])
	})
})
