import { describe, expect, it } from "bun:test"
import { formatUgFull, formatUgName, getConferente, getOdsForUg, getOrgaoSuperiorForUg } from "#/subitens/ug"

describe("leitura da UG pelo código de seis dígitos", () => {
	it("UG cadastrada", () => {
		expect(getConferente("120004 - BASE AEREA DE BRASILIA")).toBe("1S ELIANA")
		expect(getOdsForUg("120004 - BASE AEREA DE BRASILIA")).toBe("COMPREP")
		expect(getOrgaoSuperiorForUg("120004 - BASE AEREA DE BRASILIA")).toBe("VI COMAR")
		expect(formatUgName("120004 - BASE AEREA DE BRASILIA")).toBe("120004 - BASE AEREA DE BRASILIA (BABR)")
		expect(formatUgFull("120004 - BASE AEREA DE BRASILIA")).toBe("UG 120004 (BABR), subordinada ao VI COMAR / COMPREP")
	})

	it("código de seis dígitos sem cadastro", () => {
		expect(getConferente("999999 X")).toBe("Não atribuído")
		expect(getOdsForUg("999999 X")).toBe("OUTROS")
		expect(getOrgaoSuperiorForUg("999999 X")).toBe("OUTROS")
		expect(formatUgName("999999 X")).toBe("999999 X")
		expect(formatUgFull("999999 X")).toBe("999999 X")
	})

	it("sem código de seis dígitos isolado", () => {
		for (const ug of ["", "GABAER", "1200041", "12000"]) {
			expect(getConferente(ug)).toBe("Não atribuído")
			expect(getOdsForUg(ug)).toBe("OUTROS")
			expect(getOrgaoSuperiorForUg(ug)).toBe("OUTROS")
			expect(formatUgName(ug)).toBe(ug)
			expect(formatUgFull(ug)).toBe(ug)
		}
	})
})
