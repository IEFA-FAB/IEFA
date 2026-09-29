import { describe, expect, test } from "bun:test"
import { assertProportionCaps, assertRelativeOnlyForGlobal, summarizeTemplateDemand } from "./templates.ts"

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

describe("summarizeTemplateDemand — apoio e média de dias úteis", () => {
	test("apoio mede porções por kit sobre os kits e arredonda para cima; sem média de dia útil", () => {
		const items = [{ dayOfWeek: 1, mealTypeId: ALMOCO, headcountOverride: null, recommendedProportion: 50, eventMealId: "kit" }]
		const bases = new Map<string, number | null>([["kit", 3]])
		expect(summarizeTemplateDemand(items, [], bases, "apoio")).toMatchObject({ headcount_filled: 1, total: 2, avg_headcount_weekday: null })
	})

	test("evento não entra na média de dias úteis (o dia 1 é só marcador)", () => {
		const items = [{ dayOfWeek: 1, mealTypeId: ALMOCO, headcountOverride: 300, recommendedProportion: null, eventMealId: "coquetel" }]
		expect(summarizeTemplateDemand(items, [], new Map(), "event").avg_headcount_weekday).toBeNull()
	})
})

describe("modelo global só com quantidade relativa", () => {
	const codeOf = (fn: () => unknown) => {
		try {
			fn()
		} catch (e) {
			return (e as { code?: string }).code
		}
		return undefined
	}

	test("recusa pax, efetivo e ocorrências em modelo global", () => {
		expect(codeOf(() => assertRelativeOnlyForGlobal(null, { items: [{ headcountOverride: 300 }] }))).toBe("GLOBAL_TEMPLATE_ABSOLUTE_QUANTITY")
		expect(codeOf(() => assertRelativeOnlyForGlobal(null, { eventMeals: [{ baseHeadcount: 800 }] }))).toBe("GLOBAL_TEMPLATE_ABSOLUTE_QUANTITY")
		expect(codeOf(() => assertRelativeOnlyForGlobal(null, { meals: [{ baseHeadcount: 800 }] }))).toBe("GLOBAL_TEMPLATE_ABSOLUTE_QUANTITY")
		expect(codeOf(() => assertRelativeOnlyForGlobal(null, { expectedMonthlyOccurrences: 4 }))).toBe("GLOBAL_TEMPLATE_ABSOLUTE_QUANTITY")
	})

	test("aceita só relativo no global e qualquer coisa na cozinha", () => {
		expect(codeOf(() => assertRelativeOnlyForGlobal(null, { items: [{ headcountOverride: null }], eventMeals: [{ baseHeadcount: null }] }))).toBeUndefined()
		expect(codeOf(() => assertRelativeOnlyForGlobal(7, { items: [{ headcountOverride: 300 }], expectedMonthlyOccurrences: 4 }))).toBeUndefined()
	})

	test("teto da proporção: 300 no semanal e no evento, porções por kit até 1000 no apoio", () => {
		expect(codeOf(() => assertProportionCaps("weekly", [{ recommendedProportion: 301 }]))).toBe("RECOMMENDED_PROPORTION_ABOVE_CAP")
		expect(codeOf(() => assertProportionCaps("event", [{ recommendedProportion: 400 }]))).toBe("RECOMMENDED_PROPORTION_ABOVE_CAP")
		expect(codeOf(() => assertProportionCaps("apoio", [{ recommendedProportion: 1000 }]))).toBeUndefined()
	})
})
