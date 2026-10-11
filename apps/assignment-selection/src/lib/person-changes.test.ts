import { describe, expect, it } from "vitest"
import { expectedFilters, expectedForChanges, expectedState, splitPersonChanges } from "./person-changes"

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

	it("confirmar sozinho ainda passa pela escolha (a função confere a OM da edição)", () => {
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

describe("expectedState / expectedFilters", () => {
	const person = { id: 7, nome: "FULANO", localidade: "GAP RJ", estado: "Rio de Janeiro", show_card: true, show_om: false, hide_card: false }

	it("leva só as flags de telão e a OM que a tela viu", () => {
		expect(expectedState(person)).toEqual({ localidade: "GAP RJ", show_card: true, show_om: false, hide_card: false })
	})

	it("confere cada chave com eq, e a OM vazia com is null", () => {
		expect(expectedFilters(expectedState({ ...person, localidade: null }))).toEqual([
			{ column: "localidade", op: "is", value: null },
			{ column: "show_card", op: "eq", value: true },
			{ column: "show_om", op: "eq", value: false },
			{ column: "hide_card", op: "eq", value: false },
		])
	})

	it("chave ausente não é conferida", () => {
		expect(expectedFilters({ show_om: true })).toEqual([{ column: "show_om", op: "eq", value: true }])
	})
})

describe("expectedForChanges", () => {
	const person = { show_card: true, show_om: false, hide_card: false }

	it("confere só a flag que a correção manual muda, com o valor que a caixa mostrava", () => {
		expect(expectedForChanges(person, { show_om: true })).toEqual({ show_om: false })
		expect(expectedForChanges(person, { hide_card: true, show_card: false })).toEqual({ show_card: true, hide_card: false })
	})

	it("nome e classificação não levam estado esperado", () => {
		expect(expectedForChanges(person, { nome: "FULANO" })).toBeUndefined()
	})
})
