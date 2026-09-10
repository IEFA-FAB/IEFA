import { describe, expect, it } from "bun:test"
import { applyEdit, isDraftStale, resolveDraft } from "#/hooks/use-editable-message"

describe("resolveDraft", () => {
	it("devolve o texto gerado quando não há rascunho", () => {
		expect(resolveDraft(undefined, "gerado")).toBe("gerado")
	})

	it("devolve o rascunho quando ele é sobre esta geração", () => {
		expect(resolveDraft({ base: "gerado", text: "ajustado à mão" }, "gerado")).toBe("ajustado à mão")
	})

	// Preencher o número da mensagem regenera o texto inteiro. Descartar o rascunho
	// aqui apagaria em silêncio o que a conferente escreveu; o texto continua sendo
	// o dela e a tela é que avisa da defasagem.
	it("mantém o rascunho quando a geração muda, e o marca como defasado", () => {
		expect(resolveDraft({ base: "com prazo", text: "com prazo, editado" }, "sem prazo")).toBe("com prazo, editado")
		expect(isDraftStale({ base: "com prazo", text: "com prazo, editado" }, "sem prazo")).toBe(true)
	})

	it("não marca defasagem quando a geração não mudou", () => {
		expect(isDraftStale({ base: "gerado", text: "editado" }, "gerado")).toBe(false)
		expect(isDraftStale(undefined, "gerado")).toBe(false)
	})

	it("aceita rascunho vazio (o usuário pode apagar tudo)", () => {
		expect(resolveDraft({ base: "gerado", text: "" }, "gerado")).toBe("")
	})
})

describe("applyEdit", () => {
	it("guarda o texto do usuário junto da geração que ele editou", () => {
		expect(applyEdit({}, "120062", "gerado", "editado")).toEqual({ "120062": { base: "gerado", text: "editado" } })
	})

	// Rascunho idêntico ao gerado some da tela (sem aviso, sem botão de restaurar) e
	// continuaria mascarando as regerações seguintes.
	it("apaga o rascunho quando o usuário volta ao texto gerado", () => {
		expect(applyEdit({ "120062": { base: "gerado", text: "editado" } }, "120062", "gerado", "gerado")).toEqual({})
	})

	it("não mexe no rascunho das outras UGs", () => {
		const prev = { "120062": { base: "a", text: "b" }, "120039": { base: "c", text: "d" } }
		expect(applyEdit(prev, "120062", "a", "a")).toEqual({ "120039": { base: "c", text: "d" } })
	})
})
