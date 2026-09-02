import { describe, expect, it } from "bun:test"
import { newDocument } from "./draft"
import { applyChatPatch, beginTurn, editDocument, initialEditorState, lastTurnChanges, touchedBlocks, undoTurn } from "./editor-state"

function stateWithText() {
	return initialEditorState({ ...newDocument(), city: "Brasília", paragraphs: [{ text: "Primeiro." }, { text: "Segundo." }] })
}

describe("turno da conversa", () => {
	it("desfaz o turno inteiro, não o último remendo", () => {
		// Uma mensagem pode disparar três ferramentas; desfazer uma delas deixaria o
		// documento num meio-termo que ninguém pediu.
		let state = beginTurn(stateWithText())
		state = applyChatPatch(state, "set_ementa", { subject: "Prorrogação de prazo" })
		state = applyChatPatch(state, "replace_paragraph", { number: 1, text: "Reescrito." })
		expect(state.document.subject).toBe("Prorrogação de prazo")
		expect(lastTurnChanges(state)).toBe(2)

		const undone = undoTurn(state)
		expect(undone.document.subject).toBe("")
		expect(undone.document.paragraphs[0].text).toBe("Primeiro.")
	})

	it("acumula os blocos tocados para o preview destacar", () => {
		let state = beginTurn(stateWithText())
		state = applyChatPatch(state, "set_ementa", { subject: "Assunto" })
		state = applyChatPatch(state, "write_body", { paragraphs: [{ text: "Novo." }] })
		expect(touchedBlocks(state).sort()).toEqual(["ementa", "texto"])
	})

	it("remendo inválido não altera o documento nem conta como alteração", () => {
		let state = beginTurn(stateWithText())
		state = applyChatPatch(state, "replace_paragraph", { number: 99, text: "..." })
		expect(state.document.paragraphs).toHaveLength(2)
		expect(lastTurnChanges(state)).toBe(0)
	})

	it("desfazer sem turno nenhum devolve o estado intacto", () => {
		const state = stateWithText()
		expect(undoTurn(state)).toEqual(state)
	})

	it("edição manual não abre turno — o desfazer é da conversa", () => {
		const state = editDocument(stateWithText(), { city: "Rio de Janeiro" })
		expect(state.document.city).toBe("Rio de Janeiro")
		expect(state.turns).toHaveLength(0)
	})

	it("trocar de documento zera a pilha: desfazer não ressuscita outro documento", () => {
		const outro = initialEditorState({ ...newDocument(), subject: "Outro documento" })
		expect(outro.turns).toHaveLength(0)
		expect(undoTurn(outro).document.subject).toBe("Outro documento")
	})
})
