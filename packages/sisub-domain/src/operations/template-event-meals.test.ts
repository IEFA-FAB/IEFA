import { describe, expect, test } from "bun:test"
import type { TemplateEventMeal, TemplateItem } from "../schemas/templates.ts"
import { DomainError } from "../types/errors.ts"
import {
	forkStoredEventContent,
	keepItemsOfMeals,
	mergeSlotItems,
	normalizeStoredEventContent,
	remapEventMealIds,
	resolveEventContent,
} from "./template-event-meals.ts"

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

describe("keepItemsOfMeals", () => {
	test("item de refeição que saiu vai junto; item sem refeição fica para o resolvedor recusar", () => {
		const kept = keepItemsOfMeals([coquetel], [item(), item({ eventMealId: GALA }), item({ eventMealId: null })])
		expect(kept.map((i) => i.eventMealId)).toEqual([COQUETEL, null])
	})
})

describe("normalizeStoredEventContent", () => {
	test("item gravado fora da composição fica sem grupo; sem refeição vai para a do horário ou para uma nova", () => {
		const { eventMeals, items } = normalizeStoredEventContent(
			[coquetel],
			[item({ itemGroup: "sobremesa" }), item({ eventMealId: null, mealTypeId: JANTAR }), item({ eventMealId: null, mealTypeId: ALMOCO })]
		)
		expect(items.map((i) => i.itemGroup)).toEqual([null, "volante", "volante"])
		expect(eventMeals).toHaveLength(2)
		expect(eventMeals[1]?.mealTypeId).toBe(ALMOCO)
		expect(items.map((i) => i.eventMealId)).toEqual([COQUETEL, COQUETEL, eventMeals[1]?.id])
		// O resultado passa pelo resolvedor sem erro.
		expect(resolveEventContent("event", eventMeals, items)).toHaveLength(3)
	})
})

describe("forkStoredEventContent", () => {
	const gala: TemplateEventMeal = { ...coquetel, id: GALA, name: "Gala", mealTypeId: ALMOCO, groups: [{ key: "entrada", label: "Entradas" }] }

	test("refeição tirada na cópia não volta pelo item gravado sem refeição", () => {
		// O item sem refeição é do horário da gala; a gala não veio em eventMeals.
		const { eventMeals, items } = forkStoredEventContent(
			[coquetel, gala],
			[coquetel],
			[item(), item({ eventMealId: null, mealTypeId: ALMOCO, itemGroup: "entrada" }), item({ eventMealId: GALA, itemGroup: "entrada" })]
		)
		expect(eventMeals.map((m) => m.id)).toEqual([COQUETEL])
		expect(items.map((i) => i.eventMealId)).toEqual([COQUETEL])
	})

	test("sem eventMeals, a cópia leva as refeições do molde e arruma os itens gravados", () => {
		const { eventMeals, items } = forkStoredEventContent([coquetel, gala], undefined, [
			item(),
			item({ eventMealId: null, mealTypeId: ALMOCO, itemGroup: "entrada" }),
		])
		expect(eventMeals.map((m) => m.id)).toEqual([COQUETEL, GALA])
		expect(items.map((i) => i.eventMealId)).toEqual([COQUETEL, GALA])
	})

	test("grupo que a composição enviada perdeu sai do item", () => {
		const semVolante: TemplateEventMeal = { ...coquetel, groups: [{ key: "entrada", label: "Entradas" }] }
		const { items } = forkStoredEventContent([coquetel], [semVolante], [item({ itemGroup: "volante" })])
		expect(items.map((i) => i.itemGroup)).toEqual([null])
		expect(resolveEventContent("event", [semVolante], items)).toHaveLength(1)
	})
})

describe("normalizeStoredEventContent — nome da refeição reconstruída", () => {
	test("vem do nome do horário quando informado, como no editor", () => {
		const { eventMeals } = normalizeStoredEventContent([coquetel], [item({ eventMealId: null, mealTypeId: ALMOCO })], new Map([[ALMOCO, "Almoço"]]))
		expect(eventMeals[1]?.name).toBe("Almoço")
	})
})

describe("mergeSlotItems", () => {
	const row = (o: { recipeId: string; eventMealId: string | null; sortOrder: number; headcountOverride: number | null }) => o
	const AGUA = "20000000-0000-4000-8000-000000000002"

	test("refeições do mesmo horário entram na ordem do evento, sem intercalar pela posição", () => {
		const merged = mergeSlotItems(
			[
				row({ recipeId: RECIPE, eventMealId: GALA, sortOrder: 0, headcountOverride: 80 }),
				row({ recipeId: AGUA, eventMealId: COQUETEL, sortOrder: 1, headcountOverride: 100 }),
				row({ recipeId: "20000000-0000-4000-8000-000000000003", eventMealId: COQUETEL, sortOrder: 0, headcountOverride: 100 }),
			],
			[COQUETEL, GALA]
		)
		expect(merged.map((i) => i.eventMealId)).toEqual([COQUETEL, COQUETEL, GALA])
		expect(merged[0]?.sortOrder).toBe(0)
	})

	test("preparação repetida vira um item com o pax somado", () => {
		const merged = mergeSlotItems(
			[
				row({ recipeId: AGUA, eventMealId: COQUETEL, sortOrder: 0, headcountOverride: 100 }),
				row({ recipeId: AGUA, eventMealId: GALA, sortOrder: 0, headcountOverride: 80 }),
				row({ recipeId: RECIPE, eventMealId: GALA, sortOrder: 1, headcountOverride: null }),
				row({ recipeId: RECIPE, eventMealId: COQUETEL, sortOrder: 1, headcountOverride: 50 }),
			],
			[COQUETEL, GALA]
		)
		// Pax desconhecido num lado deixa o item sem pax, em vez de contar só o outro.
		expect(merged.map((i) => [i.recipeId, i.headcountOverride])).toEqual([
			[AGUA, 180],
			[RECIPE, null],
		])
	})

	test("repetição dentro da MESMA refeição passa como está", () => {
		const merged = mergeSlotItems(
			[
				row({ recipeId: AGUA, eventMealId: COQUETEL, sortOrder: 0, headcountOverride: 100 }),
				row({ recipeId: AGUA, eventMealId: COQUETEL, sortOrder: 1, headcountOverride: 100 }),
				row({ recipeId: AGUA, eventMealId: GALA, sortOrder: 0, headcountOverride: 80 }),
			],
			[COQUETEL, GALA]
		)
		expect(merged.map((i) => i.headcountOverride)).toEqual([180, 100])
	})
})

describe("normalizeStoredEventContent — refeição gravada sem grupo", () => {
	test("lê a composição padrão, como o editor, e mantém o grupo do item", () => {
		const { eventMeals, items } = normalizeStoredEventContent([{ ...coquetel, groups: [] }], [item({ itemGroup: "entrada" })])
		expect(eventMeals[0]?.groups.length).toBeGreaterThan(0)
		expect(items[0]?.itemGroup).toBe("entrada")
	})
})
