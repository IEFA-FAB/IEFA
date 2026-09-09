import { describe, expect, it } from "bun:test"
import { resolveDraft } from "#/hooks/use-editable-message"

describe("resolveDraft", () => {
	it("devolve o texto gerado quando não há rascunho", () => {
		expect(resolveDraft(undefined, "gerado")).toBe("gerado")
	})

	it("devolve o rascunho quando ele é sobre esta geração", () => {
		expect(resolveDraft({ base: "gerado", text: "ajustado à mão" }, "gerado")).toBe("ajustado à mão")
	})

	// Trocar o tipo da mensagem de COM_PRAZO para ALERTA reescreve o corpo. Manter
	// o rascunho aqui copiaria "até o dia 12/09" numa mensagem que não tem prazo.
	it("descarta o rascunho quando a geração muda", () => {
		expect(resolveDraft({ base: "com prazo", text: "com prazo, editado" }, "sem prazo")).toBe("sem prazo")
	})

	it("aceita rascunho vazio (o usuário pode apagar tudo)", () => {
		expect(resolveDraft({ base: "gerado", text: "" }, "gerado")).toBe("")
	})
})
