import { describe, expect, test } from "vitest"
import { createEmptyDayMeals, formatDate } from "./meal"

describe("createEmptyDayMeals", () => {
	test("todas as refeições começam desmarcadas", () => {
		expect(createEmptyDayMeals()).toEqual({ cafe: false, almoco: false, janta: false, ceia: false })
	})

	test("devolve uma nova instância a cada chamada (sem estado compartilhado)", () => {
		const a = createEmptyDayMeals()
		a.cafe = true
		expect(createEmptyDayMeals().cafe).toBe(false)
	})
})

describe("formatDate", () => {
	test("formata uma data ISO como dd/mm/aaaa sem deslocar por fuso", () => {
		// Ancorada em T00:00:00 local → o dia não pode 'vazar' para o anterior
		expect(formatDate("2026-07-06")).toBe("06/07/2026")
	})
})
