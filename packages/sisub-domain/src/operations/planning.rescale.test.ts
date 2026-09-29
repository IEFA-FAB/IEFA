import { describe, expect, test } from "bun:test"
import { resolveItemDemand } from "./demand-math.ts"
import { portionsForArrivingHeadcount, portionsForNewProportion, rescaledPortions } from "./planning.ts"
import { portionsPerKit } from "./snack-requests.ts"

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

describe("portionsForNewProportion", () => {
	test("item da rotina segue o efetivo do dia", () => {
		expect(portionsForNewProportion({ planned: 90, proportion: 30, headcount: 300, originTemplateType: "weekly" }, 50)).toBe(150)
	})

	test("item de apoio recupera a base (kits) das próprias porções, não usa o efetivo da rotina", () => {
		// 30 kits × 2 por kit = 60; passar para 3 por kit dá 90, com efetivo da rotina de 300 ignorado.
		expect(portionsForNewProportion({ planned: 60, proportion: 200, headcount: 300, originTemplateType: "apoio" }, 300)).toBe(90)
		expect(portionsForNewProportion({ planned: null, proportion: null, headcount: 300, originTemplateType: "apoio" }, 300)).toBeNull()
		expect(portionsForNewProportion({ planned: 240, proportion: 60, headcount: 800, originTemplateType: "event" }, 30)).toBe(120)
	})
})

describe("portionsPerKit", () => {
	test("proporção ÷ 100; zero tira do kit; sem proporção usa o pax antigo ou 1", () => {
		expect(portionsPerKit(200, null)).toBe(2)
		expect(portionsPerKit("50", null)).toBe(0.5)
		expect(portionsPerKit(0, null)).toBe(0)
		expect(portionsPerKit(null, 3)).toBe(3)
		expect(portionsPerKit(null, null)).toBe(1)
	})
})
