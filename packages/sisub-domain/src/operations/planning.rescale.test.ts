import { describe, expect, test } from "bun:test"
import { resolveItemDemand } from "./demand-math.ts"
import { portionsForArrivingHeadcount, rescaledPortions } from "./planning.ts"

describe("rescaledPortions", () => {
	test("item derivado da previsão acompanha a previsão nova", () => {
		expect(rescaledPortions({ planned: 380, proportion: null, oldHeadcount: 380, newHeadcount: 300 })).toBe(300)
		expect(rescaledPortions({ planned: 114, proportion: 30, oldHeadcount: 380, newHeadcount: 300 })).toBe(90)
	})

	test("porções ajustadas à mão não são tocadas", () => {
		expect(rescaledPortions({ planned: 250, proportion: null, oldHeadcount: 380, newHeadcount: 300 })).toBeNull()
		expect(rescaledPortions({ planned: null, proportion: null, oldHeadcount: 380, newHeadcount: 300 })).toBeNull()
	})
})

describe("portionsForArrivingHeadcount", () => {
	test("efetivo que chega calcula a porção pela proporção", () => {
		expect(portionsForArrivingHeadcount({ proportion: 30, originTemplateType: "weekly", headcount: 600 })).toBe(180)
		expect(portionsForArrivingHeadcount({ proportion: null, originTemplateType: null, headcount: 600 })).toBe(600)
	})

	test("item de evento ou apoio não mede pelo efetivo da rotina", () => {
		expect(portionsForArrivingHeadcount({ proportion: 30, originTemplateType: "event", headcount: 600 })).toBeNull()
		expect(portionsForArrivingHeadcount({ proportion: 100, originTemplateType: "apoio", headcount: 600 })).toBeNull()
	})
})

describe("resolveItemDemand — arredondamento", () => {
	test("apoio arredonda para cima; semanal e evento para o mais próximo", () => {
		expect(resolveItemDemand({ baseHeadcount: 3, recommendedProportion: 50, rounding: "up" })).toBe(2)
		expect(resolveItemDemand({ baseHeadcount: 3, recommendedProportion: 50 })).toBe(2)
		expect(resolveItemDemand({ baseHeadcount: 7, recommendedProportion: 10, rounding: "up" })).toBe(1)
		expect(resolveItemDemand({ baseHeadcount: 7, recommendedProportion: 10 })).toBe(1)
		expect(resolveItemDemand({ baseHeadcount: 10, recommendedProportion: 70, rounding: "up" })).toBe(7)
		expect(resolveItemDemand({ baseHeadcount: 15, recommendedProportion: 200, rounding: "up" })).toBe(30)
	})
})
