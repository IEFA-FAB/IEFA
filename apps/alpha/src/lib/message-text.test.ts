import { describe, expect, it } from "bun:test"
import { messageText } from "./message-text.ts"

describe("messageText", () => {
	it("devolve string de conteúdo como está", () => {
		expect(messageText("Conforme o RADA-e…")).toBe("Conforme o RADA-e…")
	})

	it("concatena blocos de texto do Bedrock", () => {
		// Regressão: `.content.toString()` num array chama String() em cada elemento e
		// produzia "[object Object],[object Object]" no lugar da resposta — literalmente o
		// que o usuário via na tela.
		const conteudo = [
			{ type: "text", text: "As atribuições do ordenador " },
			{ type: "text", text: "de despesas são…" },
		]

		expect(messageText(conteudo)).toBe("As atribuições do ordenador de despesas são…")
	})

	it("nunca devolve o literal [object Object]", () => {
		expect(messageText([{ type: "text", text: "ok" }])).not.toContain("[object Object]")
	})

	it("descarta bloco que não é texto", () => {
		// Uso de ferramenta e raciocínio não são resposta: incluí-los misturaria argumento
		// de ferramenta no texto entregue ao usuário.
		const conteudo = [
			{ type: "tool_use", name: "buscar", input: { q: "x" } },
			{ type: "text", text: "resposta" },
		]

		expect(messageText(conteudo)).toBe("resposta")
	})

	it("tolera array de strings", () => {
		expect(messageText(["a", "b"])).toBe("ab")
	})

	it("devolve vazio para conteúdo ausente ou inesperado", () => {
		expect(messageText(undefined)).toBe("")
		expect(messageText(null)).toBe("")
		expect(messageText({ type: "text", text: "x" })).toBe("")
	})
})
