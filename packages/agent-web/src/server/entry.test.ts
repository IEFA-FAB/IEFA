import { describe, expect, test } from "bun:test"
import type { DiscoveryDocument } from "../catalog.ts"
import { createAgentServerEntry } from "./entry.ts"

const DOCS: DiscoveryDocument[] = [{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "Guide" }]

const PAGE = `<!DOCTYPE html><html><head><title>Página</title></head><body>
	<nav>Menu lateral</nav>
	<main id="conteudo"><h1>Assunto</h1><p>Corpo.</p></main>
	<footer>Rodapé</footer>
</body></html>`

/** Imita o handler do Start, inclusive o 500 para Accept não suportado. */
function fakeStartHandler(response?: Response) {
	const seen: Request[] = []
	const handler = (request: Request) => {
		seen.push(request)
		if (response) return response

		const accept = request.headers.get("accept") ?? "*/*"
		const supported = accept.split(",").some((part) => part.trim().startsWith("*/*") || part.trim().startsWith("text/html"))
		if (!supported) {
			return Response.json({ error: "Only HTML requests are supported here" }, { status: 500 })
		}
		return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } })
	}
	return { handler, seen }
}

function request(accept: string, method = "GET") {
	return new Request("https://teste.iefa.com.br/pagina", { method, headers: { accept } })
}

describe("createAgentServerEntry", () => {
	test("navegador continua recebendo HTML", async () => {
		const { handler } = fakeStartHandler()
		const entry = createAgentServerEntry({ handler, discoveryDocuments: DOCS })

		const response = await entry.fetch(request("text/html,*/*;q=0.8"), undefined)
		expect(response.status).toBe(200)
		expect(response.headers.get("content-type")).toContain("text/html")
	})

	test("Accept: text/markdown devolve markdown do conteúdo", async () => {
		const { handler } = fakeStartHandler()
		const entry = createAgentServerEntry({ handler, discoveryDocuments: DOCS })

		const response = await entry.fetch(request("text/markdown"), undefined)
		expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
		expect(response.headers.get("vary")).toBe("Accept")

		const body = await response.text()
		expect(body).toContain("Corpo.")
		expect(body).not.toContain("Rodapé")
	})

	// O handler do Start 500 em Accept não-HTML, então a requisição interna pede HTML.
	test("pede HTML ao handler ao servir markdown", async () => {
		const { handler, seen } = fakeStartHandler()
		const entry = createAgentServerEntry({ handler })

		await entry.fetch(request("text/markdown"), undefined)
		expect(seen[0].headers.get("accept")).toBe("text/html")
	})

	test("Accept não suportado vira 406, não 500", async () => {
		const { handler } = fakeStartHandler()
		const entry = createAgentServerEntry({ handler, discoveryDocuments: DOCS })

		const response = await entry.fetch(request("application/json"), undefined)
		expect(response.status).toBe(406)
		expect(await response.text()).toContain("/llms.txt")
	})

	test("respostas de documento levam o header Link", async () => {
		const { handler } = fakeStartHandler()
		const entry = createAgentServerEntry({ handler, discoveryDocuments: DOCS })

		const response = await entry.fetch(request("text/html"), undefined)
		expect(response.headers.get("link")).toContain('</llms.txt>; rel="describedby"')
	})

	test("redirect passa intacto em vez de virar markdown", async () => {
		const redirect = new Response(null, { status: 301, headers: { location: "/destino" } })
		const { handler } = fakeStartHandler(redirect)
		const entry = createAgentServerEntry({ handler })

		const response = await entry.fetch(request("text/markdown"), undefined)
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toBe("/destino")
	})

	test("resposta sem região de conteúdo cai de volta para o HTML", async () => {
		const empty = new Response("<!DOCTYPE html><html><body></body></html>", { headers: { "content-type": "text/html" } })
		const { handler } = fakeStartHandler(empty)
		const entry = createAgentServerEntry({ handler })

		const response = await entry.fetch(request("text/markdown"), undefined)
		expect(response.headers.get("content-type")).toContain("text/html")
	})

	test("seletor de conteúdo é configurável por app", async () => {
		const custom = new Response('<html><head><title>T</title></head><body><div id="app">Conteúdo do app</div></body></html>', {
			headers: { "content-type": "text/html" },
		})
		const { handler } = fakeStartHandler(custom)
		const entry = createAgentServerEntry({ handler, contentSelectors: ["#app"] })

		expect(await (await entry.fetch(request("text/markdown"), undefined)).text()).toContain("Conteúdo do app")
	})

	// Erro no boot é muito melhor que header corrompido em produção.
	test("título não-ASCII falha na montagem do entry", () => {
		const { handler } = fakeStartHandler()
		expect(() =>
			createAgentServerEntry({
				handler,
				discoveryDocuments: [{ path: "/x", rel: "describedby", type: "text/plain", title: "Catálogo" }],
			})
		).toThrow(/ASCII/)
	})

	test("repassa as opções recebidas ao handler", async () => {
		const received: unknown[] = []
		const entry = createAgentServerEntry<{ context: string }>({
			handler: (_request, opts) => {
				received.push(opts)
				return new Response("<html><body><main>x</main></body></html>", { headers: { "content-type": "text/html" } })
			},
		})

		await entry.fetch(request("text/html"), { context: "abc" })
		expect(received[0]).toEqual({ context: "abc" })
	})
})
