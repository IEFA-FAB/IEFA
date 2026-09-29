import { describe, expect, test } from "vitest"
import {
	hasInvalidHeadcount,
	occasionHeadcountDraft,
	occasionHeadcountRows,
	occasionHeadcountsPayload,
	parseHeadcountInput,
	weeklyHeadcountRows,
	weeklyHeadcountsPayload,
} from "./apply-headcounts"

describe("parseHeadcountInput", () => {
	test("vazio é a definir; inteiro positivo passa; o resto é inválido", () => {
		expect(parseHeadcountInput("")).toBeNull()
		expect(parseHeadcountInput("  ")).toBeNull()
		expect(parseHeadcountInput("800")).toBe(800)
		expect(parseHeadcountInput("0")).toBe("invalid")
		expect(parseHeadcountInput("12.5")).toBe("invalid")
		expect(parseHeadcountInput("-3")).toBe("invalid")
		expect(parseHeadcountInput("100001")).toBe("invalid")
	})
})

describe("semanal", () => {
	const almoco = { name: "Almoço", sort_order: 2 }
	const cafe = { name: "Café", sort_order: 1 }
	const template = {
		items: [
			{ meal_type_id: "almoco", recipe_id: "arroz", meal_type: almoco },
			{ meal_type_id: "almoco", recipe_id: "feijao", meal_type: almoco },
			{ meal_type_id: "cafe", recipe_id: "pao", meal_type: cafe },
			// Item sem preparação não é aplicado: a refeição dele não pede efetivo.
			{ meal_type_id: "ceia", recipe_id: null, meal_type: { name: "Ceia", sort_order: 3 } },
		],
		meals: [
			{ meal_type_id: "almoco", base_headcount: 800 },
			{ meal_type_id: "almoco", base_headcount: 750 },
			{ meal_type_id: "cafe", base_headcount: null },
		],
	}

	test("uma linha por refeição aplicada, na ordem da cozinha, com o efetivo do cardápio", () => {
		expect(weeklyHeadcountRows(template)).toEqual([
			{ id: "cafe", label: "Café", templateHint: null },
			{ id: "almoco", label: "Almoço", templateHint: "750 a 800" },
		])
	})

	test("modelo global chega sem efetivo em nenhuma refeição", () => {
		expect(weeklyHeadcountRows({ ...template, meals: [] }).every((row) => row.templateHint == null)).toBe(true)
	})

	test("só vai o que foi digitado; nada digitado não manda o campo", () => {
		expect(weeklyHeadcountsPayload({ almoco: "900", cafe: "" })).toEqual([{ mealTypeId: "almoco", headcount: 900 }])
		expect(weeklyHeadcountsPayload({ almoco: "", cafe: "" })).toBeUndefined()
		expect(weeklyHeadcountsPayload({})).toBeUndefined()
	})
})

describe("evento e apoio", () => {
	const meals = [
		{ id: "coquetel", name: "Coquetel", base_headcount: 120 },
		{ id: "jantar", name: "Jantar", base_headcount: null },
	]

	test("o campo nasce com o efetivo do cardápio local e vazio no global", () => {
		expect(occasionHeadcountDraft(meals, false)).toEqual({ coquetel: "120", jantar: "" })
		expect(occasionHeadcountDraft(meals, true)).toEqual({ coquetel: "", jantar: "" })
	})

	test("toda refeição vai; vazio vai como a definir", () => {
		expect(occasionHeadcountsPayload(meals, { coquetel: "100", jantar: "" })).toEqual([
			{ occasionMealId: "coquetel", headcount: 100 },
			{ occasionMealId: "jantar", headcount: null },
		])
	})

	test("cardápio sem refeição própria não manda o campo", () => {
		expect(occasionHeadcountsPayload([], {})).toBeUndefined()
	})

	test("linhas na ordem do cardápio", () => {
		expect(occasionHeadcountRows(meals).map((r) => r.label)).toEqual(["Coquetel", "Jantar"])
	})
})

test("valor que não é efetivo segura o aplicar", () => {
	expect(hasInvalidHeadcount({ a: "10", b: "" })).toBe(false)
	expect(hasInvalidHeadcount({ a: "0" })).toBe(true)
})
