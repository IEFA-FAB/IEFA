import { describe, expect, test } from "bun:test"
import { daysSeverityClass, getSubmissionAgeSeverity } from "./submission-age"

describe("getSubmissionAgeSeverity", () => {
	test("até 7 dias está em dia", () => {
		expect(getSubmissionAgeSeverity(0)).toBe("on-time")
		expect(getSubmissionAgeSeverity(7)).toBe("on-time")
	})

	test("de 8 a 14 dias pede atenção", () => {
		expect(getSubmissionAgeSeverity(8)).toBe("attention")
		expect(getSubmissionAgeSeverity(14)).toBe("attention")
	})

	test("acima de 14 dias está atrasado", () => {
		expect(getSubmissionAgeSeverity(15)).toBe("late")
		expect(getSubmissionAgeSeverity(90)).toBe("late")
	})
})

describe("daysSeverityClass", () => {
	test("tabela e cartão concordam na cor de cada limite", () => {
		for (const [days, token] of [
			[7, "success"],
			[8, "warning"],
			[14, "warning"],
			[15, "destructive"],
		] as const) {
			expect(daysSeverityClass(days)).toContain(`text-${token}`)
			expect(daysSeverityClass(days, "badge")).toContain(`text-${token}`)
			expect(daysSeverityClass(days, "badge")).toContain(`bg-${token}/10`)
		}
	})

	test("atraso no texto vem em negrito", () => {
		expect(daysSeverityClass(15)).toContain("font-semibold")
		expect(daysSeverityClass(14)).not.toContain("font-semibold")
	})

	test("só tokens do tema, nunca paleta crua", () => {
		for (const days of [0, 8, 15]) {
			for (const surface of ["text", "badge"] as const) {
				expect(daysSeverityClass(days, surface)).not.toMatch(/-(red|green|yellow|amber|emerald|rose)-\d/)
			}
		}
	})
})
