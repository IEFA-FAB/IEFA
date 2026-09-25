import { describe, expect, test } from "bun:test"
import type { TemplateEventMeal, TemplateItem } from "../schemas/templates.ts"
import { DomainError } from "../types/errors.ts"
import { remapEventMealIds, resolveEventContent } from "./template-event-meals.ts"

const JANTAR = "00000000-0000-4000-8000-000000000001"
const ALMOCO = "00000000-0000-4000-8000-000000000002"
const COQUETEL = "10000000-0000-4000-8000-000000000001"
const GALA = "10000000-0000-4000-8000-000000000002"
const RECIPE = "20000000-0000-4000-8000-000000000001"

const coquetel: TemplateEventMeal = {
	id: COQUETEL,
	name: "Coquetel",
	mealTypeId: JANTAR,
	groups: [
		{ key: "entrada", label: "Entradas" },
		{ key: "volante", label: "Volantes" },
	],
}

function item(overrides: Partial<TemplateItem> = {}): TemplateItem {
	return { dayOfWeek: 1, mealTypeId: ALMOCO, recipeId: RECIPE, itemGroup: "volante", recommendedProportion: null, eventMealId: COQUETEL, ...overrides }
}

function codeOf(fn: () => unknown): string | undefined {
	try {
		fn()
	} catch (e) {
		return e instanceof DomainError ? e.code : "NOT_DOMAIN"
	}
	return undefined
}

describe("resolveEventContent", () => {
	test("item de evento sai com o horário da refeição, não com o que foi enviado", () => {
		const [resolved] = resolveEventContent("event", [coquetel], [item({ mealTypeId: ALMOCO })])
		expect(resolved?.mealTypeId).toBe(JANTAR)
	})

	test("evento sem refeição e sem item é válido — refeições são zero ou mais", () => {
		expect(resolveEventContent("event", [], [])).toEqual([])
	})

	test("item de evento sem refeição é recusado", () => {
		expect(codeOf(() => resolveEventContent("event", [coquetel], [item({ eventMealId: null })]))).toBe("EVENT_ITEM_WITHOUT_MEAL")
	})

	test("item citando refeição que não está no evento é recusado", () => {
		expect(codeOf(() => resolveEventContent("event", [coquetel], [item({ eventMealId: GALA })]))).toBe("EVENT_MEAL_NOT_FOUND")
	})

	test("grupo fora da composição da refeição é recusado; sem grupo passa", () => {
		expect(codeOf(() => resolveEventContent("event", [coquetel], [item({ itemGroup: "sobremesa" })]))).toBe("ITEM_GROUP_NOT_IN_SET")
		expect(resolveEventContent("event", [coquetel], [item({ itemGroup: null })])).toHaveLength(1)
	})

	test("refeição ou grupo repetidos são recusados", () => {
		expect(codeOf(() => resolveEventContent("event", [coquetel, { ...coquetel }], []))).toBe("EVENT_MEAL_DUPLICATE")
		const doubled = { ...coquetel, groups: [...coquetel.groups, { key: "entrada", label: "Entradas frias" }] }
		expect(codeOf(() => resolveEventContent("event", [doubled], []))).toBe("EVENT_MEAL_GROUP_DUPLICATE")
	})

	test("fora de evento não há refeição própria, e o item segue como veio", () => {
		expect(codeOf(() => resolveEventContent("weekly", [coquetel], []))).toBe("EVENT_MEALS_ONLY_IN_EVENTS")
		expect(codeOf(() => resolveEventContent("exception", [], [item()]))).toBe("EVENT_MEALS_ONLY_IN_EVENTS")
		const routine = item({ eventMealId: undefined, itemGroup: "prato_principal" })
		expect(resolveEventContent("weekly", [], [routine])).toEqual([routine])
	})
})

describe("remapEventMealIds", () => {
	test("dá ids novos às refeições e reaponta só os itens delas", () => {
		const gala: TemplateEventMeal = { ...coquetel, id: GALA, name: "Jantar de gala" }
		const { eventMeals, items } = remapEventMealIds([coquetel, gala], [item(), item({ eventMealId: GALA }), item({ eventMealId: null })])

		const [newCoquetel, newGala] = eventMeals
		expect(newCoquetel?.id).not.toBe(COQUETEL)
		expect(newGala?.id).not.toBe(GALA)
		expect(newCoquetel?.name).toBe("Coquetel")
		expect(items.map((i) => i.eventMealId)).toEqual([newCoquetel?.id, newGala?.id, null])
	})
})
