import { describe, expect, test } from "bun:test"
import {
	DEFINITIVE_RECEIPT_ROLES,
	DESIGNATION_SCREEN_LABEL,
	designationInputProblems,
	designationMissingMessage,
	isDesignationActive,
	PROVISIONAL_RECEIPT_ROLES,
} from "./designations.ts"

describe("designationMissingMessage", () => {
	test("provisório e definitivo exigem designação e citam a alínea do art. 140, II", () => {
		expect(designationMissingMessage("provisional", false)).toMatch(/art\. 140, II, a/)
		expect(designationMissingMessage("definitive", false)).toMatch(/art\. 140, II, b/)
	})

	test("quem não pode designar lê quem designa e onde; a conferência fica", () => {
		const message = designationMissingMessage("definitive", false)
		expect(message).toContain("chefe do rancho")
		expect(message).toContain(DESIGNATION_SCREEN_LABEL)
		expect(message).toMatch(/conferência já registrada fica/)
	})

	test("quem pode designar é mandado designar ali mesmo", () => {
		expect(designationMissingMessage("provisional", true)).toMatch(/Designe agora/)
		expect(designationMissingMessage("provisional", true)).not.toContain(DESIGNATION_SCREEN_LABEL)
	})
})

describe("papéis", () => {
	test("o definitivo é só de gestor ou comissão; o provisório aceita também os fiscais", () => {
		expect(DEFINITIVE_RECEIPT_ROLES).toEqual(["manager", "committee_member"])
		for (const role of DEFINITIVE_RECEIPT_ROLES) expect(PROVISIONAL_RECEIPT_ROLES).toContain(role)
		expect(PROVISIONAL_RECEIPT_ROLES).toContain("technical_inspector")
	})
})

describe("designationInputProblems", () => {
	const ok = {
		source: "ato" as const,
		sourceReference: "BI nº 123/2026",
		validFrom: "2026-09-01",
		validTo: null,
		empenhoId: null,
		arpId: null,
		acquisitionId: null,
	}

	test("ato com referência e início passa", () => {
		expect(designationInputProblems(ok)).toEqual([])
	})

	test("ato sem número do boletim ou portaria é recusado — também o permanente", () => {
		expect(designationInputProblems({ ...ok, sourceReference: "  " })[0]).toMatch(/boletim interno ou da portaria/)
		expect(designationInputProblems({ ...ok, source: "permanente", sourceReference: null })).toHaveLength(1)
	})

	test("vigência invertida e dois vínculos ao mesmo tempo", () => {
		expect(designationInputProblems({ ...ok, validTo: "2026-08-01" })[0]).toMatch(/anterior ao início/)
		expect(designationInputProblems({ ...ok, empenhoId: "e", arpId: "a" })[0]).toMatch(/UMA contratação, ARP ou empenho/)
	})
})

describe("isDesignationActive", () => {
	test("vale do início ao fim, inclusive", () => {
		expect(isDesignationActive({ validFrom: "2026-09-01", validTo: null }, "2026-09-26")).toBe(true)
		expect(isDesignationActive({ validFrom: "2026-09-27", validTo: null }, "2026-09-26")).toBe(false)
		expect(isDesignationActive({ validFrom: "2026-01-01", validTo: "2026-09-26" }, "2026-09-26")).toBe(true)
		expect(isDesignationActive({ validFrom: "2026-01-01", validTo: "2026-09-25" }, "2026-09-26")).toBe(false)
	})
})
