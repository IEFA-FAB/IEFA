import { describe, expect, test } from "vitest"
import { isHeadcountPending } from "./headcount-pending"

describe("isHeadcountPending", () => {
	test("refeição sem efetivo com preparação sem porções fica a definir", () => {
		expect(isHeadcountPending({ forecasted_headcount: null, menu_items: [{ planned_portion_quantity: null, origin_template_type: "weekly" }] })).toBe(true)
		// Item manual (sem origem) também espera o efetivo.
		expect(isHeadcountPending({ forecasted_headcount: null, menu_items: [{ planned_portion_quantity: null, origin_template_type: null }] })).toBe(true)
	})

	test("com efetivo, ou com todas as porções preenchidas, não há pendência", () => {
		expect(isHeadcountPending({ forecasted_headcount: 800, menu_items: [{ planned_portion_quantity: null }] })).toBe(false)
		expect(isHeadcountPending({ forecasted_headcount: null, menu_items: [{ planned_portion_quantity: 120 }] })).toBe(false)
		expect(isHeadcountPending({ forecasted_headcount: null, menu_items: [] })).toBe(false)
	})

	test("zero é efetivo gravado, não pendência", () => {
		expect(isHeadcountPending({ forecasted_headcount: 0, menu_items: [{ planned_portion_quantity: null }] })).toBe(false)
	})

	test("item de evento ou apoio sem porções não conta: o efetivo da rotina não o preenche", () => {
		expect(
			isHeadcountPending({
				forecasted_headcount: null,
				menu_items: [
					{ planned_portion_quantity: null, origin_template_type: "event" },
					{ planned_portion_quantity: null, origin_template_type: "apoio" },
				],
			})
		).toBe(false)
	})
})
