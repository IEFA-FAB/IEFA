import { SARAM_FALLBACK_ERROR_MESSAGE } from "@iefa/database/saram-link"
import { describe, expect, test } from "vitest"
import { type Feedback, getAlternativesTitle, getErrorMessage, getFeedbackSource, hasSaramAlternatives, selectFeedback } from "./military-record-panel"

describe("getErrorMessage", () => {
	test("Error com mensagem", () => expect(getErrorMessage(new Error("boom"))).toBe("boom"))
	test("Error sem mensagem cai no texto padrão", () => expect(getErrorMessage(new Error(""))).toBe(SARAM_FALLBACK_ERROR_MESSAGE))
	test("não-Error cai no texto padrão", () => expect(getErrorMessage("boom")).toBe(SARAM_FALLBACK_ERROR_MESSAGE))
})

describe("hasSaramAlternatives", () => {
	test.each([
		[["verify_cpf"], true],
		[["request_link"], true],
		[["set_institutional"], true],
		[["confirm_candidate", "set_personal", "withdraw_request"], false],
		[[], false],
	] as const)("%j → %p", (actions, expected) => {
		expect(hasSaramAlternatives({ actions: [...actions] })).toBe(expected)
	})
})

describe("getAlternativesTitle", () => {
	test("vínculo antigo, com ou sem alternativas abertas", () => {
		expect(getAlternativesTitle("legacy", false)).toBe("Se quiser, confirme o vínculo agora")
		expect(getAlternativesTitle("legacy", true)).toBe("Se quiser, confirme o vínculo agora")
	})
	test("depois do 'Não sou eu'", () => expect(getAlternativesTitle("suggestion", true)).toBe("Então vamos por outro caminho"))
	test("alternativas como a tela", () => expect(getAlternativesTitle("no_match", false)).toBe("Como vincular seu SARAM"))
})

describe("getFeedbackSource", () => {
	test("erro sem mudança de estado fica no formulário", () => expect(getFeedbackSource("error", "no_match", "no_match", "cpf")).toBe("cpf"))
	test("erro que mudou o estado vai para o topo", () => expect(getFeedbackSource("error", "locked_out", "no_match", "cpf")).toBe("top"))
	test("sucesso vai para o topo", () => expect(getFeedbackSource("success", "verified", "verified", "suffix")).toBe("top"))
	test("informação vai para o topo", () => expect(getFeedbackSource("info", "no_match", "no_match", "request")).toBe("top"))
})

describe("selectFeedback", () => {
	const feedback: Feedback = { kind: "error", title: "t", description: "d", source: "cpf" }
	test("sem retorno", () => expect(selectFeedback(null, "cpf")).toBeNull())
	test("retorno de outro formulário", () => expect(selectFeedback(feedback, "request")).toBeNull())
	test("retorno deste formulário", () => expect(selectFeedback(feedback, "cpf")).toBe(feedback))
})
