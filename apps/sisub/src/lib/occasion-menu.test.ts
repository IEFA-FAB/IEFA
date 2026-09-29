import { describe, expect, test } from "vitest"
import { parseProportionInput, proportionInputValue, proportionModeFor, withLegacySnackPortions } from "./occasion-menu"

describe("proporção por regime", () => {
	test("apoio lê porções por kit; evento e semanal, % do efetivo", () => {
		expect(proportionModeFor("apoio")).toBe("portionsPerKit")
		expect(proportionModeFor("event")).toBe("percent")
		expect(proportionModeFor("weekly")).toBe("percent")
		expect(proportionModeFor(null)).toBe("percent")
	})

	test("porções por kit: valor ÷ 100 na tela, × 100 gravado, com decimal e vírgula", () => {
		expect(proportionInputValue(200, "portionsPerKit")).toBe(2)
		expect(proportionInputValue(50, "portionsPerKit")).toBe(0.5)
		expect(proportionInputValue(null, "portionsPerKit")).toBe("")
		expect(parseProportionInput("2", "portionsPerKit")).toBe(200)
		expect(parseProportionInput("0.5", "portionsPerKit")).toBe(50)
		expect(parseProportionInput("0,5", "portionsPerKit")).toBe(50)
		expect(parseProportionInput("", "portionsPerKit")).toBeNull()
		expect(parseProportionInput("abc", "portionsPerKit")).toBeUndefined()
	})

	test("tetos: 10 porções por kit (1000) no apoio, 300% nos demais", () => {
		expect(parseProportionInput("25", "portionsPerKit")).toBe(1000)
		expect(parseProportionInput("-1", "portionsPerKit")).toBe(0)
		expect(parseProportionInput("450", "percent")).toBe(300)
		expect(parseProportionInput("30", "percent")).toBe(30)
		expect(proportionInputValue(30, "percent")).toBe(30)
	})
})

describe("padrão de lanche gravado com as porções no pax", () => {
	test("o pax vira porções por kit na proporção", () => {
		expect(withLegacySnackPortions({ headcount_override: 2, recommended_proportion: null })).toEqual({ headcount_override: null, recommended_proportion: 200 })
	})

	test("item já na proporção, ou sem número, fica como está", () => {
		const current = { headcount_override: null, recommended_proportion: 150 }
		expect(withLegacySnackPortions(current)).toBe(current)
		const both = { headcount_override: 3, recommended_proportion: 100 }
		expect(withLegacySnackPortions(both)).toBe(both)
	})
})
