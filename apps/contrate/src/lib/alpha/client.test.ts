import { describe, expect, it } from "bun:test"
import { DEFAULT_ALPHA_BASE_URL } from "./client"

describe("ALPHA_BASE_URL", () => {
	it("aponta para o host do α em produção", () => {
		// `hosts` do stack `infra/alpha`. Errar aqui deixa a tela sem responder pergunta
		// nenhuma. A asserção é sobre o DEFAULT, não sobre o valor resolvido: o build de
		// produção não passa `VITE_ALPHA_API_URL`, e o dev que aponta o portal para um α
		// local não deve receber uma suíte vermelha por isso.
		expect(DEFAULT_ALPHA_BASE_URL).toBe("https://alpha.iefa.com.br")
	})
})
