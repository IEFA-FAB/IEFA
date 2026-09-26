import { describe, expect, test } from "bun:test"
import { summarizeTemplateDemand } from "./templates.ts"

const CAFE = "cafe"
const ALMOCO = "almoco"

describe("summarizeTemplateDemand", () => {
	test("efetivo da refeição conta como comensais do item sem override", () => {
		const items = [
			{ dayOfWeek: 1, mealTypeId: CAFE, headcountOverride: null, recommendedProportion: null },
			{ dayOfWeek: 1, mealTypeId: ALMOCO, headcountOverride: null, recommendedProportion: 50 },
		]
		const meals = [
			{ dayOfWeek: 1, mealTypeId: CAFE, baseHeadcount: 220 },
			{ dayOfWeek: 1, mealTypeId: ALMOCO, baseHeadcount: 380 },
		]
		expect(summarizeTemplateDemand(items, meals)).toEqual({ headcount_filled: 2, avg_headcount_weekday: 205, total: 410 })
	})

	test("override do item vence o efetivo; célula sem efetivo nem override fica de fora", () => {
		const items = [
			{ dayOfWeek: 2, mealTypeId: CAFE, headcountOverride: 10, recommendedProportion: null },
			{ dayOfWeek: 2, mealTypeId: ALMOCO, headcountOverride: null, recommendedProportion: null },
		]
		const meals = [{ dayOfWeek: 2, mealTypeId: CAFE, baseHeadcount: 220 }]
		expect(summarizeTemplateDemand(items, meals)).toEqual({ headcount_filled: 1, avg_headcount_weekday: 10, total: 10 })
	})

	test("fim de semana não entra na média Seg–Qui", () => {
		const items = [{ dayOfWeek: 6, mealTypeId: CAFE, headcountOverride: null, recommendedProportion: null }]
		const meals = [{ dayOfWeek: 6, mealTypeId: CAFE, baseHeadcount: 60 }]
		expect(summarizeTemplateDemand(items, meals)).toEqual({ headcount_filled: 1, avg_headcount_weekday: null, total: 60 })
	})
})

describe("summarizeTemplateDemand — evento", () => {
	test("item de evento mede a porcentagem sobre o efetivo da refeição do evento, não da célula", () => {
		const items = [
			{ dayOfWeek: 1, mealTypeId: ALMOCO, headcountOverride: null, recommendedProportion: 60, eventMealId: "coquetel" },
			{ dayOfWeek: 1, mealTypeId: ALMOCO, headcountOverride: 40, recommendedProportion: 60, eventMealId: "coquetel" },
			{ dayOfWeek: 1, mealTypeId: ALMOCO, headcountOverride: null, recommendedProportion: null, eventMealId: "gala" },
		]
		// Célula do almoço com efetivo 800 não pode vazar para o evento.
		const meals = [{ dayOfWeek: 1, mealTypeId: ALMOCO, baseHeadcount: 800 }]
		const bases = new Map<string, number | null>([
			["coquetel", 300],
			["gala", null],
		])
		expect(summarizeTemplateDemand(items, meals, bases)).toMatchObject({ headcount_filled: 2, total: 180 + 40 })
	})
})
