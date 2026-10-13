import { describe, expect, test } from "bun:test"
import type { TemplateEventMeal, TemplateItem } from "../schemas/templates.ts"
import { adaptComposedContent, buildTemplateScalarUpdates } from "./templates.ts"

describe("buildTemplateScalarUpdates", () => {
	test("nada enviado, nada muda", () => {
		expect(buildTemplateScalarUpdates({})).toEqual({})
	})

	test("nome e tipo nulos não entram; descrição e recorrência nulas limpam", () => {
		expect(
			buildTemplateScalarUpdates({
				name: null as unknown as undefined,
				templateType: null as unknown as undefined,
				description: null,
				expectedMonthlyOccurrences: null,
			})
		).toEqual({
			description: null,
			expectedMonthlyOccurrences: null,
		})
	})

	test("valores enviados entram", () => {
		expect(buildTemplateScalarUpdates({ name: "Semana A", description: "x", templateType: "event", expectedMonthlyOccurrences: 4 })).toEqual({
			name: "Semana A",
			description: "x",
			templateType: "event",
			expectedMonthlyOccurrences: 4,
		})
	})
})

describe("adaptComposedContent", () => {
	const meal = (over: Partial<TemplateEventMeal>): TemplateEventMeal =>
		({ id: "n1", name: "Café", mealTypeId: "cafe", groups: [], baseHeadcount: 40, sourceTemplateId: null, ...over }) as TemplateEventMeal
	const item = (over: Partial<TemplateItem>): TemplateItem =>
		({ dayOfWeek: 1, mealTypeId: "cafe", recipeId: "r1", headcountOverride: 12, itemGroup: null, sortOrder: 0, eventMealId: "n1", ...over }) as TemplateItem

	const content = {
		eventMeals: [meal({ id: "n1" }), meal({ id: "n2", mealTypeId: "almoco", baseHeadcount: null, sourceTemplateId: "avo" })],
		items: [item({})],
		originalMealIds: ["o1", "o2"],
	}

	test("cardápio da cozinha: horário escolhido pela refeição de origem, pax e efetivo mantidos, procedência preenchida", () => {
		const out = adaptComposedContent(content, "tpl", new Map([["o2", "jantar"]]), true)
		expect(out.eventMeals.map((m) => [m.id, m.mealTypeId, m.baseHeadcount, m.sourceTemplateId])).toEqual([
			["n1", "cafe", 40, "tpl"],
			["n2", "jantar", null, "avo"],
		])
		expect(out.items[0]?.headcountOverride).toBe(12)
	})

	test("modelo global: sem efetivo e sem pax", () => {
		const out = adaptComposedContent(content, "tpl", new Map(), false)
		expect(out.eventMeals.map((m) => m.baseHeadcount)).toEqual([null, null])
		expect(out.items[0]?.headcountOverride).toBeUndefined()
	})
})
