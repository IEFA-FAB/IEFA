import { describe, expect, test } from "vitest"
import { snapshotIngredientLines, substitutionCount } from "./menu-substitutions"

describe("snapshotIngredientLines", () => {
	test("lê o snapshot no contrato do domínio (ingredient aninhado), não em campos que ele não tem", () => {
		const lines = snapshotIngredientLines({
			name: "Suco",
			ingredients: [
				{ id: "linha-1", ingredient_id: "laranja", net_quantity: "0.25", ingredient: { description: "Laranja pera", measure_unit: "kg" } },
				{ id: "linha-2", ingredient_id: null, net_quantity: 1 },
			],
		})
		expect(lines).toEqual([{ lineId: "linha-1", ingredientId: "laranja", name: "Laranja pera", quantityLabel: "0.25 kg" }])
	})

	test("snapshot vazio ou antigo não quebra", () => {
		expect(snapshotIngredientLines(null)).toEqual([])
		expect(snapshotIngredientLines({ name: "x" })).toEqual([])
		expect(substitutionCount({ a: {}, recipe_swap: {} })).toBe(2)
		expect(substitutionCount(null)).toBe(0)
	})
})
