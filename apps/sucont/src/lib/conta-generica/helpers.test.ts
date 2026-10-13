import { describe, expect, it } from "bun:test"
import { formatCurrency, formatMilitaryDate, getConferente, getOds, getOs, getRacInfo, getUgName } from "#/lib/conta-generica/helpers"

describe("helpers da conta genérica", () => {
	it("lê o cadastro de UG e cai no rótulo próprio quando a UG não existe", () => {
		expect([getConferente("120001"), getOds("120004"), getOs("120004"), getUgName("120006")]).toEqual(["1S ELIANA", "COMPREP", "VI COMAR", "GAP-BR"])
		expect([getConferente("888888"), getOds("888888"), getOs("888888"), getUgName("888888")]).toEqual(["NÃO MAPEADO", "OUTROS", "OUTROS", "NÃO IDENTIFICADA"])
		// UG cadastrada sem conferente: o rótulo é o desta tela, não o do registro.
		expect(getConferente("120017")).toBe("NÃO MAPEADO")
	})

	it("classifica a conta pela questão RAC do primeiro dígito", () => {
		expect(getRacInfo("91199").id).toBe("29")
		expect(getRacInfo("09999")).toEqual({ id: "XX", title: "Questão RAC XX", description: "Utilização de conta genérica" })
		expect(getRacInfo("").id).toBe("XX")
	})

	it("formata moeda e data militar", () => {
		expect(formatCurrency(1234.5)).toBe("R$ 1.234,50")
		expect(formatMilitaryDate("2026-12-01")).toBe("01DEZ2026")
		expect(formatMilitaryDate("")).toBe("XXXMÊSANO")
	})
})
