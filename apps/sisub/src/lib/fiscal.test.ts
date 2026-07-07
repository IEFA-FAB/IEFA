import { describe, expect, test } from "vitest"
import { generateRestrictedDates, inferDefaultMeal, MEAL_LABEL } from "./fiscal"

describe("MEAL_LABEL", () => {
	test("cobre as quatro refeições com rótulos pt-BR", () => {
		expect(MEAL_LABEL).toEqual({ cafe: "Café", almoco: "Almoço", janta: "Jantar", ceia: "Ceia" })
	})
})

describe("inferDefaultMeal", () => {
	const at = (h: number, m = 0) => new Date(2026, 6, 6, h, m)

	test("café entre 04:00 e 08:59", () => {
		expect(inferDefaultMeal(at(4, 0))).toBe("cafe")
		expect(inferDefaultMeal(at(8, 59))).toBe("cafe")
	})

	test("almoço entre 09:00 e 14:59", () => {
		expect(inferDefaultMeal(at(9, 0))).toBe("almoco")
		expect(inferDefaultMeal(at(14, 59))).toBe("almoco")
	})

	test("jantar entre 15:00 e 19:59", () => {
		expect(inferDefaultMeal(at(15, 0))).toBe("janta")
		expect(inferDefaultMeal(at(19, 59))).toBe("janta")
	})

	test("ceia da noite à madrugada (fora das demais faixas)", () => {
		expect(inferDefaultMeal(at(20, 0))).toBe("ceia")
		expect(inferDefaultMeal(at(0, 0))).toBe("ceia")
		expect(inferDefaultMeal(at(3, 59))).toBe("ceia")
	})
})

describe("generateRestrictedDates", () => {
	test("devolve ontem, hoje e amanhã em ISO (yyyy-mm-dd)", () => {
		const dates = generateRestrictedDates()
		expect(dates).toHaveLength(3)
		for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
		// ordenadas cronologicamente e consecutivas
		const [prev, today, next] = dates.map((d) => new Date(`${d}T00:00:00Z`).getTime())
		const DAY = 86_400_000
		expect(today - prev).toBe(DAY)
		expect(next - today).toBe(DAY)
	})
})
