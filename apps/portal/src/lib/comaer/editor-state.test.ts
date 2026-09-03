import { describe, expect, it } from "bun:test"
import { newDocument } from "./draft"
import { applyChatPatch, beginTurn, canUndo, editDocument, initialEditorState, lastTurnChanges, touchedBlocks, undoTurn } from "./editor-state"

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

describe("turno sem alteração", () => {
	it("não conta para o desfazer — o modelo só respondeu uma pergunta", () => {
		let state = beginTurn(stateWithText())
		state = applyChatPatch(state, "set_ementa", { subject: "Assunto" })
		state = beginTurn(state) // turno em que a IA só perguntou
		expect(canUndo(state)).toBe(true)

		// Desfazer volta ao estado ANTES do turno que mexeu, pulando o vazio.
		const undone = undoTurn(state)
		expect(undone.document.subject).toBe("")
	})

	it("com apenas turnos vazios, não há o que desfazer", () => {
		const state = beginTurn(beginTurn(stateWithText()))
		expect(canUndo(state)).toBe(false)
		expect(undoTurn(state).document).toEqual(state.document)
	})
})

describe("remendo recusado", () => {
	/**
	 * A transcrição mostra "↳ Trocou um parágrafo" mesmo quando o remendo foi recusado. Sem a
	 * marca, o usuário vê a ferramenta rodar, o documento não mudar, e conclui que a folha é
	 * que está errada.
	 */
	it("marca a recusa e não altera o documento", () => {
		const state = applyChatPatch(initialEditorState(newDocument()), "replace_paragraph", { number: 99, text: "..." })
		expect(state.rejectedPatch).toBe("replace_paragraph")
		// `newDocument()` já nasce com cinco parágrafos vazios: o que importa é que nenhum foi tocado.
		expect(state.document.paragraphs.every((p) => p.text === "")).toBe(true)
	})

	it("limpa a marca no remendo seguinte que dá certo", () => {
		let state = applyChatPatch(initialEditorState(newDocument()), "replace_paragraph", { number: 99, text: "..." })
		state = applyChatPatch(state, "write_body", { paragraphs: [{ text: "Texto." }] })
		expect(state.rejectedPatch).toBeUndefined()
	})

	it("poda o `null` do modelo como o servidor faz, e não recusa o turno por causa dele", () => {
		// O despacho do servidor já poda; o cliente aplicava o remendo cru, e as duas metades
		// do mesmo caminho passavam a discordar sobre o que o modelo pediu.
		const state = applyChatPatch(initialEditorState(newDocument()), "set_form", { kind: "requerimento", scope: null })
		expect(state.rejectedPatch).toBeUndefined()
		expect(state.document.kind).toBe("requerimento")
	})
})
