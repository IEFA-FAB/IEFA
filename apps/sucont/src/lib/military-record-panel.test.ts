import { describe, expect, it } from "bun:test"
import { getErrorText, getFeedbackVariant, isAlternativesStep, TONE_BADGE } from "#/lib/military-record-panel"
import { SARAM_LINK_FALLBACK_MESSAGE } from "#/lib/saram-link"

describe("TONE_BADGE", () => {
	// Equivale ao ternário antigo: ok → success, blocked → destructive, attention → warning, resto → outline.
	it("mapeia os quatro tons", () => {
		expect(TONE_BADGE).toEqual({ ok: "success", blocked: "destructive", attention: "warning", info: "outline" })
	})
})

describe("isAlternativesStep", () => {
	it.each([
		["alternatives", true],
		["cpf", true],
		["request", true],
		["institutional", true],
		["personal", false],
		["withdraw", false],
		[null, false],
	] as const)("%p → %p", (step, expected) => {
		expect(isAlternativesStep(step)).toBe(expected)
	})
})

describe("getErrorText", () => {
	it("Error com mensagem", () => expect(getErrorText(new Error("boom"))).toBe("boom"))
	it("Error sem mensagem", () => expect(getErrorText(new Error(""))).toBe(SARAM_LINK_FALLBACK_MESSAGE))
	it("não-Error", () => expect(getErrorText(null)).toBe(SARAM_LINK_FALLBACK_MESSAGE))
})

describe("getFeedbackVariant", () => {
	it("error", () => expect(getFeedbackVariant("error")).toBe("destructive"))
	it("success", () => expect(getFeedbackVariant("success")).toBe("success"))
	it("info", () => expect(getFeedbackVariant("info")).toBe("info"))
})
