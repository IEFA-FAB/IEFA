import { describe, expect, test } from "vitest"
import { formatExpiry, fromDatetimeLocalValue, NO_EXPIRY, toDatetimeLocalValue } from "./grant-expiry"

describe("toDatetimeLocalValue", () => {
	test("null e undefined viram campo vazio (= sem prazo)", () => {
		expect(toDatetimeLocalValue(null)).toBe(NO_EXPIRY)
		expect(toDatetimeLocalValue(undefined)).toBe(NO_EXPIRY)
	})

	test("ISO vira YYYY-MM-DDTHH:mm na hora LOCAL, aceito pelo input", () => {
		const iso = new Date(2026, 11, 31, 23, 59).toISOString()
		expect(toDatetimeLocalValue(iso)).toBe("2026-12-31T23:59")
	})

	test("data inválida não vaza 'Invalid Date' para o input", () => {
		expect(toDatetimeLocalValue("não é data")).toBe(NO_EXPIRY)
	})
})

describe("fromDatetimeLocalValue", () => {
	test("campo vazio vira null — o valor que LIMPA o prazo no domínio", () => {
		expect(fromDatetimeLocalValue("")).toBeNull()
	})

	test("ida e volta preserva o instante", () => {
		const iso = new Date(2027, 5, 15, 8, 30).toISOString()
		expect(fromDatetimeLocalValue(toDatetimeLocalValue(iso))).toBe(iso)
	})

	test("valor inválido vira null em vez de propagar Invalid Date para o schema", () => {
		expect(fromDatetimeLocalValue("31/12/2026")).toBeNull()
	})
})

describe("formatExpiry", () => {
	test("sem prazo vira travessão, nunca string vazia", () => {
		expect(formatExpiry(null)).toBe("—")
		expect(formatExpiry("")).toBe("—")
	})

	test("data válida é formatada em pt-BR", () => {
		expect(formatExpiry(new Date(2026, 0, 2, 13, 45).toISOString())).toContain("02/01/2026")
	})
})
