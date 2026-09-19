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
		// O id vem da URL do contrate: cru, `../aci/queue?x=` trocava a rota chamada no α.
		expect(alphaPath`/api/v1/submissions/${"../aci/queue?x="}/text`).toBe("/api/v1/submissions/..%2Faci%2Fqueue%3Fx%3D/text")
		expect(alphaPath`/api/v1/aci/queue?unit_id=${26}`).toBe("/api/v1/aci/queue?unit_id=26")
		expect(alphaPath`/api/v1/rules`).toBe("/api/v1/rules")
	})
})
