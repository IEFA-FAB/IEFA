import { describe, expect, it } from "vitest"
import { splitPersonChanges } from "./person-changes"

describe("splitPersonChanges", () => {
	it("manda localidade/estado/hide_card para a escolha e o resto para o update comum", () => {
		const { choice, rest, hasChoice, hasRest } = splitPersonChanges({
			localidade: "GAP RJ",
			estado: "Rio de Janeiro",
			hide_card: true,
			show_om: true,
			nome: "Fulano",
		})
		expect(choice).toEqual({ localidade: "GAP RJ", estado: "Rio de Janeiro", hide_card: true })
		expect(rest).toEqual({ show_om: true, nome: "Fulano" })
		expect(hasChoice).toBe(true)
		expect(hasRest).toBe(true)
	})

	it("confirmar sozinho ainda passa pela escolha (é o que consome vaga)", () => {
		const { choice, hasChoice, hasRest } = splitPersonChanges({ hide_card: true })
		expect(choice).toEqual({ hide_card: true })
		expect(hasChoice).toBe(true)
		expect(hasRest).toBe(false)
	})

	it("preserva null (limpar a OM) e ignora undefined", () => {
		const { choice, hasRest } = splitPersonChanges({ localidade: null, show_card: undefined })
		expect(choice).toEqual({ localidade: null })
		expect(hasRest).toBe(false)
	})

	it("flags de telão não tocam a escolha", () => {
		const { hasChoice, rest } = splitPersonChanges({ show_card: true, show_om: false })
		expect(hasChoice).toBe(false)
		expect(rest).toEqual({ show_card: true, show_om: false })
	})
})
