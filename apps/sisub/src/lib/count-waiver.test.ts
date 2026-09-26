import { describe, expect, test } from "vitest"
import { formatPendingProductionDays, PENDING_PRODUCTION_SQLSTATE, parsePendingProductionDays } from "./count-waiver"

describe("ressalva da contagem pelo código, não pelo texto", () => {
	test("o código é o que a migration levanta", () => {
		expect(PENDING_PRODUCTION_SQLSTATE).toBe("P0W01")
	})

	test("todos os dias do HINT, em ordem e sem repetir", () => {
		expect(parsePendingProductionDays("2026-09-26,2026-09-25,2026-09-26")).toEqual(["2026-09-25", "2026-09-26"])
	})

	test("HINT ausente ou malformado não inventa dia", () => {
		expect(parsePendingProductionDays(null)).toEqual([])
		expect(parsePendingProductionDays("25/09, ontem")).toEqual([])
	})

	test("rótulo dos dias para a pergunta da ressalva", () => {
		expect(formatPendingProductionDays(["2026-09-26"])).toBe("26/09")
		expect(formatPendingProductionDays(["2026-09-24", "2026-09-25", "2026-09-26"])).toBe("24/09, 25/09 e 26/09")
	})
})
