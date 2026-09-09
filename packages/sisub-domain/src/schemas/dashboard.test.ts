import { describe, expect, test } from "bun:test"
import { MAX_DASHBOARD_RANGE_DAYS, UnitDashboardSchema } from "./dashboard.ts"

const BASE = { unitId: 3, startDate: "2026-09-01", endDate: "2026-09-30" }

describe("UnitDashboardSchema", () => {
	test("aceita a janela padrão da tela", () => {
		expect(UnitDashboardSchema.parse(BASE)).toMatchObject(BASE)
	})

	test("messHallId é opcional — ausente significa todos os refeitórios da unidade", () => {
		expect(UnitDashboardSchema.parse(BASE).messHallId).toBeUndefined()
	})

	test("recusa intervalo invertido", () => {
		expect(UnitDashboardSchema.safeParse({ ...BASE, startDate: "2026-09-30", endDate: "2026-09-01" }).success).toBe(false)
	})

	test(`recusa intervalo acima de ${MAX_DASHBOARD_RANGE_DAYS} dias`, () => {
		// Sem teto, o painel devolve o diretório nominal de um período arbitrário — que é
		// exatamente a exposição que este trabalho fecha.
		expect(UnitDashboardSchema.safeParse({ ...BASE, startDate: "2020-01-01", endDate: "2026-09-30" }).success).toBe(false)
	})

	test("aceita exatamente o teto", () => {
		expect(UnitDashboardSchema.safeParse({ ...BASE, startDate: "2026-01-01", endDate: "2026-04-02" }).success).toBe(true)
	})

	test("recusa data fora do formato ISO", () => {
		expect(UnitDashboardSchema.safeParse({ ...BASE, startDate: "01/09/2026" }).success).toBe(false)
	})

	test("recusa unidade não positiva", () => {
		expect(UnitDashboardSchema.safeParse({ ...BASE, unitId: 0 }).success).toBe(false)
	})
})
