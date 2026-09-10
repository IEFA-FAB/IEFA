import { describe, expect, it } from "bun:test"
import { composeNonRadaAnswer, NO_BASIS_ANSWER } from "./provenance.ts"

describe("composeNonRadaAnswer", () => {
	it("declara a procedência quando há fonte", () => {
		const texto = composeNonRadaAnswer({ hasAnswer: true, source: "Lei nº 14.133/2021", answer: "o prazo é de cinco dias úteis" })

		expect(texto).toBe("Essa informação não é proveniente do RADA-e, mas com base em Lei nº 14.133/2021: o prazo é de cinco dias úteis")
	})

	it("recusa resposta sem fonte — é o caso que a regra existe para impedir", () => {
		expect(composeNonRadaAnswer({ hasAnswer: true, answer: "o prazo é de cinco dias úteis" })).toBe(NO_BASIS_ANSWER)
		expect(composeNonRadaAnswer({ hasAnswer: true, source: "   ", answer: "algo" })).toBe(NO_BASIS_ANSWER)
	})

	it("recusa fonte sem resposta", () => {
		expect(composeNonRadaAnswer({ hasAnswer: true, source: "ICA 100-12", answer: "  " })).toBe(NO_BASIS_ANSWER)
	})

	it("respeita o modelo dizendo que não sabe", () => {
		expect(composeNonRadaAnswer({ hasAnswer: false, source: "Lei 14.133", answer: "talvez seja isso" })).toBe(NO_BASIS_ANSWER)
	})

	it("nunca entrega conteúdo sem uma das duas ressalvas", () => {
		const casos = [
			{ hasAnswer: true, source: "X", answer: "Y" },
			{ hasAnswer: true, source: null, answer: "Y" },
			{ hasAnswer: false, source: null, answer: null },
			{ hasAnswer: true, source: "X", answer: null },
		]

		for (const caso of casos) {
			const texto = composeNonRadaAnswer(caso)
			expect(texto === NO_BASIS_ANSWER || texto.startsWith("Essa informação não é proveniente do RADA-e")).toBe(true)
		}
	})
})
