import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
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
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())

	const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

	test("devolve ontem, hoje e amanhã na DATA LOCAL (sem vazar por fuso)", () => {
		// Instante às 23:30 locais de 06/07: em fuso negativo (BRT) já é 07/07 em UTC.
		// Se a fonte usasse toISOString (UTC), o slot 'hoje' viraria 07/07 — o que
		// quebraria a data padrão da fiscalização durante o jantar/ceia.
		vi.setSystemTime(new Date(2026, 6, 6, 23, 30))
		const dates = generateRestrictedDates()

		expect(dates).toEqual([localIso(new Date(2026, 6, 5)), localIso(new Date(2026, 6, 6)), localIso(new Date(2026, 6, 7))])
		expect(dates[1]).toBe("2026-07-06") // 'hoje' local, não o dia seguinte em UTC
	})

	test("mantém o formato yyyy-mm-dd e três dias consecutivos", () => {
		vi.setSystemTime(new Date(2026, 0, 1, 8, 0))
		const dates = generateRestrictedDates()
		expect(dates).toHaveLength(3)
		for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
		// vira a virada de ano corretamente (31/12 → 01/01 → 02/01)
		expect(dates).toEqual(["2025-12-31", "2026-01-01", "2026-01-02"])
	})
})
