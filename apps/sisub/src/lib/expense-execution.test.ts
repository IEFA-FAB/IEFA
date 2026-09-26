import { describe, expect, test } from "vitest"
import { parseMoneyInput, planEmpenhoCancellation, todayInBrasilia } from "@/lib/expense-execution"

describe("parseMoneyInput — dinheiro digitado em pt-BR", () => {
	test("milhar com ponto e decimal com vírgula", () => {
		expect(parseMoneyInput("1.234,56")).toEqual({ ok: true, value: 1234.56 })
		expect(parseMoneyInput("R$ 65.492,11")).toEqual({ ok: true, value: 65492.11 })
		expect(parseMoneyInput("1234,5")).toEqual({ ok: true, value: 1234.5 })
		expect(parseMoneyInput("1234.56")).toEqual({ ok: true, value: 1234.56 })
		expect(parseMoneyInput("300")).toEqual({ ok: true, value: 300 })
	})

	test("vazio é ausência, não zero", () => {
		expect(parseMoneyInput("  ")).toEqual({ ok: true, value: null })
	})

	test("ambíguo e inválido voltam com o motivo", () => {
		const ambiguous = parseMoneyInput("1.500")
		expect(ambiguous.ok).toBe(false)
		if (!ambiguous.ok) expect(ambiguous.reason).toContain("ambíguo")
		expect(parseMoneyInput("12,3,4").ok).toBe(false)
		expect(parseMoneyInput("abc").ok).toBe(false)
		expect(parseMoneyInput("-10,00")).toEqual({ ok: false, reason: "o valor não pode ser negativo" })
	})
})

describe("planEmpenhoCancellation — anulação total pelo valor lido sob o lock", () => {
	const base = { numero: "2026NE000123", status: "ativo", vigente: 1150, liquidado: 0, aLiquidar: 1150 }

	test("sem liquidação, cancela o vigente inteiro (reforço incluído)", () => {
		expect(planEmpenhoCancellation(base)).toEqual({ ok: true, valor: 1150 })
		expect(planEmpenhoCancellation({ ...base, vigente: 1250.004 })).toEqual({ ok: true, valor: 1250 })
	})

	test("com liquidação, recusa dizendo o que fazer", () => {
		const plan = planEmpenhoCancellation({ ...base, liquidado: 300, aLiquidar: 850 })
		expect(plan.ok).toBe(false)
		if (!plan.ok) expect(plan.message).toContain("Anule só o saldo a liquidar")
	})

	test("já anulada não se anula de novo", () => {
		const plan = planEmpenhoCancellation({ ...base, status: "anulado" })
		expect(plan.ok).toBe(false)
		if (!plan.ok) expect(plan.message).toContain("já está anulado")
	})

	test("vigente zerado por eventos: cancela zero e marca o status", () => {
		expect(planEmpenhoCancellation({ ...base, vigente: 0 })).toEqual({ ok: true, valor: 0 })
	})
})

describe("todayInBrasilia", () => {
	test("02h UTC ainda é o dia anterior em Brasília", () => {
		expect(todayInBrasilia(new Date("2026-09-27T02:00:00Z"))).toBe("2026-09-26")
	})
})
