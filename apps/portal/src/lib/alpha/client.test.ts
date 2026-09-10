import { afterEach, describe, expect, it } from "bun:test"
import { ALPHA_BASE_URL, fetchAlphaHealth } from "./client"

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
})

function stubFetch(impl: (url: string) => Response | Promise<Response>) {
	const calls: string[] = []
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input)
		calls.push(url)
		return await impl(url)
	}) as typeof fetch
	return calls
}

describe("fetchAlphaHealth", () => {
	it("pergunta o nível profundo, e ao α — não a outro host", async () => {
		// O dot verde promete que dá para perguntar. O nível raso do `/health` só mede
		// memória do processo e responderia "ok" com o banco fora.
		const calls = stubFetch(() => Response.json({ status: "ok", service: "alpha" }))

		await fetchAlphaHealth()

		expect(calls).toEqual([`${ALPHA_BASE_URL}/health?deep=1`])
	})

	it("aponta para o host do α em produção", () => {
		// `hosts` do stack `infra/alpha`. Errar aqui deixa a tela em "Offline" permanente.
		expect(ALPHA_BASE_URL).toBe("https://alpha.iefa.com.br")
	})

	it("é `ok` só quando o corpo declara `ok`", async () => {
		stubFetch(() => Response.json({ status: "ok" }))
		expect(await fetchAlphaHealth()).toBe("ok")
	})

	it("trata 503 degradado como fora", async () => {
		stubFetch(() => Response.json({ status: "degraded", reason: "database_unreachable" }, { status: 503 }))
		expect(await fetchAlphaHealth()).toBe("error")
	})

	it("trata 200 com corpo inesperado como fora", async () => {
		// Um proxy ou página de erro que responde 200 em HTML não é o α no ar.
		stubFetch(() => new Response("<html>ok</html>", { status: 200 }))
		expect(await fetchAlphaHealth()).toBe("error")
	})

	it("não deixa a tela presa quando o `fetch` rejeita", async () => {
		// Rede fora, CORS ausente ou timeout: a tela precisa de uma resposta, não de uma
		// promessa pendente para sempre.
		stubFetch(() => {
			throw new TypeError("Failed to fetch")
		})
		expect(await fetchAlphaHealth()).toBe("error")
	})
})
