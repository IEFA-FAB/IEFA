import { describe, expect, test } from "bun:test"
import { rescaledPortions } from "./planning.ts"

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
