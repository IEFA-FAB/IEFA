import { describe, expect, it } from "vitest"
import { isChoiceAnnounced, maskUnannouncedChoice } from "./person-visibility"

const base = { show_om: false, hide_card: false, localidade: "GAP RJ", estado: "Rio de Janeiro" }

describe("maskUnannouncedChoice", () => {
	it("esconde a OM armada e ainda não revelada", () => {
		expect(maskUnannouncedChoice(base)).toEqual({ ...base, localidade: null, estado: null })
	})

	it("mostra a OM revelada (show_om)", () => {
		const revealed = { ...base, show_om: true }
		expect(maskUnannouncedChoice(revealed)).toBe(revealed)
	})

	it("mostra a OM dos confirmados mesmo depois do callPerson zerar o show_om", () => {
		const confirmed = { ...base, hide_card: true }
		expect(maskUnannouncedChoice(confirmed)).toBe(confirmed)
	})

	it("não copia a linha sem escolha", () => {
		const empty = { ...base, localidade: null, estado: null }
		expect(maskUnannouncedChoice(empty)).toBe(empty)
	})

	it("preserva os demais campos", () => {
		const row = { ...base, id: 7, nome: "Fulano", classificacao: 3 }
		expect(maskUnannouncedChoice(row)).toMatchObject({ id: 7, nome: "Fulano", classificacao: 3 })
	})
})

describe("isChoiceAnnounced", () => {
	it("só antes da revelação e da confirmação a escolha é privada", () => {
		expect(isChoiceAnnounced({ show_om: false, hide_card: false })).toBe(false)
		expect(isChoiceAnnounced({ show_om: true, hide_card: false })).toBe(true)
		expect(isChoiceAnnounced({ show_om: false, hide_card: true })).toBe(true)
	})
})
