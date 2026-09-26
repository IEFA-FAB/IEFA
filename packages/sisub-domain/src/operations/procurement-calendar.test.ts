import { describe, expect, test } from "bun:test"
import { computeContractingCycle } from "./procurement-calendar.ts"

describe("computeContractingCycle", () => {
	test("sem mês previsto não há ciclo", () => {
		expect(computeContractingCycle(null, 5, "2026-09-26")).toBeNull()
	})

	test("março com 5 meses de antecedência: a janela cruza o ano e começa em outubro", () => {
		const cycle = computeContractingCycle(3, 5, "2026-10-15")
		expect(cycle).toMatchObject({ due: "2027-03-01", windowStart: "2026-10-01", windowEnd: "2027-05-01", active: true, closed: false })
	})

	test("antes da janela a pendência não está ativa", () => {
		expect(computeContractingCycle(3, 5, "2026-09-26")).toMatchObject({ due: "2027-03-01", active: false })
	})

	test("até 2 meses depois do vencimento o ciclo ainda é o corrente", () => {
		expect(computeContractingCycle(3, 5, "2027-05-10")).toMatchObject({ due: "2027-03-01", active: true })
		expect(computeContractingCycle(3, 5, "2027-06-01")).toMatchObject({ due: "2028-03-01", active: false })
	})

	test("anexo concluído dentro da janela encerra o ciclo; o do ciclo anterior não", () => {
		expect(computeContractingCycle(3, 5, "2026-12-01", ["2026-11-20T13:00:00Z"])?.closed).toBe(true)
		expect(computeContractingCycle(3, 5, "2026-12-01", ["2026-03-10T13:00:00Z"])?.closed).toBe(false)
	})

	test("dezembro segue sendo o ciclo corrente em janeiro e fevereiro (carência cruza o ano)", () => {
		expect(computeContractingCycle(12, 3, "2027-01-15")).toMatchObject({ due: "2026-12-01", windowStart: "2026-09-01", windowEnd: "2027-02-01", active: true })
		expect(computeContractingCycle(12, 3, "2027-03-02")).toMatchObject({ due: "2027-12-01", active: false })
	})

	test("antecedência zero: a janela começa no próprio mês", () => {
		expect(computeContractingCycle(9, 0, "2026-09-26")).toMatchObject({ due: "2026-09-01", windowStart: "2026-09-01", active: true })
	})
})
