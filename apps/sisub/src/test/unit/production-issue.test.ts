/**
 * Unit — baixa por produção: consumo teórico do SNAPSHOT (nunca a receita
 * viva) e validade de sobra congelada.
 */
import { computeTheoreticalConsumption, leftoverExpiryDate } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"

describe("computeTheoreticalConsumption", () => {
	const snapshot = {
		portion_yield: 100,
		ingredients: [
			{ ingredient_id: "arroz", net_quantity: 50, ingredient: { description: "Arroz", measure_unit: "KG" } },
			{ ingredient_id: "oleo", net_quantity: "2.5", ingredient: { description: "Óleo", measure_unit: "LT" } },
		],
	}

	test("escala pelo efetivo: 200 comensais em receita de 100 porções = 2×", () => {
		const result = computeTheoreticalConsumption(snapshot, 200)
		expect(result).toEqual([
			{ ingredientId: "arroz", description: "Arroz", measureUnit: "KG", quantity: 100 },
			{ ingredientId: "oleo", description: "Óleo", measureUnit: "LT", quantity: 5 },
		])
	})

	test("mudança posterior da receita viva não afeta: só o snapshot entra", () => {
		// o snapshot é o argumento — não há caminho para a receita viva aqui;
		// este teste fixa o contrato: mesmo snapshot, mesmo resultado
		expect(computeTheoreticalConsumption(snapshot, 200)).toEqual(computeTheoreticalConsumption({ ...snapshot }, 200))
	})

	test("linhas órfãs (sem ingredient_id) e quantidades inválidas são ignoradas", () => {
		const result = computeTheoreticalConsumption(
			{
				portion_yield: 10,
				ingredients: [
					{ ingredient_id: null, net_quantity: 5 },
					{ ingredient_id: "x", net_quantity: 0 },
					{ ingredient_id: "y", net_quantity: "abc" },
					{ ingredient_id: "ok", net_quantity: 1, ingredient: { description: "Ok", measure_unit: "KG" } },
				],
			},
			10
		)
		expect(result).toHaveLength(1)
		expect(result[0]?.ingredientId).toBe("ok")
	})

	test("ingrediente repetido no snapshot soma", () => {
		const result = computeTheoreticalConsumption(
			{
				portion_yield: 10,
				ingredients: [
					{ ingredient_id: "a", net_quantity: 1 },
					{ ingredient_id: "a", net_quantity: 2 },
				],
			},
			10
		)
		expect(result[0]?.quantity).toBe(3)
	})

	test("rendimento zero cai para 1 (contrato do scaleIngredientQuantity)", () => {
		const result = computeTheoreticalConsumption({ portion_yield: 0, ingredients: [{ ingredient_id: "a", net_quantity: 2 }] }, 3)
		expect(result[0]?.quantity).toBe(6)
	})

	test("snapshot nulo ou efetivo não-positivo → vazio", () => {
		expect(computeTheoreticalConsumption(null, 100)).toEqual([])
		expect(computeTheoreticalConsumption(snapshot, 0)).toEqual([])
	})
})

describe("leftoverExpiryDate", () => {
	test("produção + shelf life em dias", () => {
		expect(leftoverExpiryDate("2026-07-29", 30)).toBe("2026-08-28")
	})

	test("sem shelf life → sem validade", () => {
		expect(leftoverExpiryDate("2026-07-29", null)).toBeNull()
		expect(leftoverExpiryDate("2026-07-29", 0)).toBeNull()
	})

	test("data inválida → null", () => {
		expect(leftoverExpiryDate("not-a-date", 30)).toBeNull()
	})
})
