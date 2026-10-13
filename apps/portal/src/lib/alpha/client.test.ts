import { describe, expect, it } from "bun:test"
import { alphaPath, DEFAULT_ALPHA_BASE_URL } from "./client"

describe("ALPHA_BASE_URL", () => {
	it("aponta para o host do α em produção", () => {
		// `hosts` do stack `infra/alpha`. Errar aqui deixa a tela sem responder pergunta
		// nenhuma. A asserção é sobre o DEFAULT, não sobre o valor resolvido: o build de
		// produção não passa `VITE_ALPHA_API_URL`, e o dev que aponta o portal para um α
		// local não deve receber uma suíte vermelha por isso.
		expect(DEFAULT_ALPHA_BASE_URL).toBe("https://alpha.iefa.com.br")
	})
})

describe("alphaPath", () => {
	it("codifica cada valor interpolado como um único segmento", () => {
		// O id de chunk vem da resposta do modelo: cru, `../sessions?x=` trocava a rota chamada no α.
		expect(alphaPath`/api/v1/chunks/${"../sessions?x="}`).toBe("/api/v1/chunks/..%2Fsessions%3Fx%3D")
		expect(alphaPath`/api/v1/sessions/${"s/../../x#y"}/messages`).toBe("/api/v1/sessions/s%2F..%2F..%2Fx%23y/messages")
		expect(alphaPath`/api/v1/sessions`).toBe("/api/v1/sessions")
	})
})
