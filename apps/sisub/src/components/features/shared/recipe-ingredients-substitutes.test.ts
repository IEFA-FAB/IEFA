import { describe, expect, it } from "vitest"
import type { Ingredient } from "@/types/domain/ingredients"
import type { RecipeAlternativeFormRow } from "@/types/domain/recipes"
import { appendPickedAlternatives, buildSubstituteExclusions } from "./recipe-ingredients-substitutes"

const alt = (id: string, over: Partial<RecipeAlternativeFormRow> = {}): RecipeAlternativeFormRow => ({
	ingredient_id: id,
	ingredient_name: `Alt ${id}`,
	measure_unit: "KG",
	folder_id: null,
	net_quantity: 1,
	...over,
})

const ing = (id: string, over: Partial<Ingredient> = {}): Ingredient =>
	({ id, description: `Insumo ${id}`, measure_unit: "LT", folder_id: "pasta", ...over }) as Ingredient

describe("buildSubstituteExclusions", () => {
	it("exclui o principal e os substitutos já cadastrados, nessa ordem", () => {
		const map = buildSubstituteExclusions({ ingredient_id: "p", net_quantity: 2, alternatives: [alt("a"), alt("b")] })
		expect([...map.entries()]).toEqual([
			["p", { label: "Insumo principal" }],
			["a", { label: "Já adicionado", checked: true }],
			["b", { label: "Já adicionado", checked: true }],
		])
	})
	it("linha sem insumo: só os substitutos", () => {
		const map = buildSubstituteExclusions({ ingredient_id: null, net_quantity: null, alternatives: [alt("a")] })
		expect([...map.keys()]).toEqual(["a"])
	})
	it("sem nada: mapa vazio", () => {
		expect(buildSubstituteExclusions({ ingredient_id: null, net_quantity: null, alternatives: [] }).size).toBe(0)
	})
})

describe("appendPickedAlternatives", () => {
	it("acrescenta depois dos existentes, com a quantidade do principal", () => {
		const existing = alt("a")
		const result = appendPickedAlternatives({ ingredient_id: "p", net_quantity: 2.5, alternatives: [existing] }, [ing("n")])
		expect(result[0]).toBe(existing)
		expect(result[1]).toEqual({ ingredient_id: "n", ingredient_name: "Insumo n", measure_unit: "LT", folder_id: "pasta", net_quantity: 2.5 })
	})
	it("descarta o principal e quem já é substituto", () => {
		const result = appendPickedAlternatives({ ingredient_id: "p", net_quantity: 1, alternatives: [alt("a")] }, [ing("p"), ing("a"), ing("n")])
		expect(result.map((r) => r.ingredient_id)).toEqual(["a", "n"])
	})
	it("defaults: sem descrição vira vazio, sem unidade vira UN, sem pasta vira null", () => {
		const result = appendPickedAlternatives({ ingredient_id: null, net_quantity: null, alternatives: [] }, [
			ing("n", { description: null, measure_unit: null, folder_id: null } as unknown as Partial<Ingredient>),
		])
		expect(result).toEqual([{ ingredient_id: "n", ingredient_name: "", measure_unit: "UN", folder_id: null, net_quantity: null }])
	})
	it("principal nulo não impede escolher qualquer insumo", () => {
		const result = appendPickedAlternatives({ ingredient_id: null, net_quantity: 3, alternatives: [] }, [ing("x"), ing("y")])
		expect(result.map((r) => r.ingredient_id)).toEqual(["x", "y"])
	})
})
