import { describe, expect, test } from "vitest"
import { describeTaskSheetFacts, toShownCount } from "./task-detail-sheet"

describe("toShownCount", () => {
	test("só número positivo aparece", () => {
		expect(toShownCount(12)).toBe(12)
		expect(toShownCount(0.5)).toBe(0.5)
		expect(toShownCount(0)).toBeNull()
		expect(toShownCount(-1)).toBeNull()
		expect(toShownCount(null)).toBeNull()
		expect(toShownCount(undefined)).toBeNull()
	})
})

describe("describeTaskSheetFacts", () => {
	test("com porções, tempo e rendimento: tudo aparece e as quantidades escalam", () => {
		expect(describeTaskSheetFacts({ plannedPortions: 120, preparationMinutes: 45, portionYield: 10 })).toEqual({
			plannedPortions: 120,
			preparationMinutes: 45,
			portionYield: 10,
			hasDescription: true,
			isScaled: true,
		})
	})

	test("zeros não viram um '0' solto: somem do cabeçalho e não escalam", () => {
		// Antes, `{0 && <span/>}` rendia "0" no cabeçalho e ao lado de "Ingredientes".
		expect(describeTaskSheetFacts({ plannedPortions: 0, preparationMinutes: 0, portionYield: 0 })).toEqual({
			plannedPortions: null,
			preparationMinutes: null,
			portionYield: null,
			hasDescription: false,
			isScaled: false,
		})
	})

	test("tempo zero com porções: a descrição fica, sem o tempo", () => {
		const facts = describeTaskSheetFacts({ plannedPortions: 80, preparationMinutes: 0, portionYield: 0 })
		expect(facts).toMatchObject({ plannedPortions: 80, preparationMinutes: null, portionYield: null, hasDescription: true, isScaled: false })
	})

	test("só o rendimento não abre a linha de descrição (como antes)", () => {
		expect(describeTaskSheetFacts({ plannedPortions: null, preparationMinutes: null, portionYield: 10 }).hasDescription).toBe(false)
	})
})
