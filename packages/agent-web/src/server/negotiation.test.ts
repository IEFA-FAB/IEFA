import { describe, expect, test } from "bun:test"
import type { DiscoveryDocument } from "../catalog"
import { buildDiscoveryLinkHeader, isUnsupportedAcceptResponse, notAcceptableResponse, prefersMarkdown, withDiscoveryLinks } from "./negotiation"

const DOCS: DiscoveryDocument[] = [
	{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "Guide" },
	{ path: "/sitemap.xml", rel: "sitemap", type: "application/xml", title: "Sitemap" },
]

function get(accept: string | null, method = "GET") {
	return new Request("https://example.test/", {
		method,
		headers: accept === null ? {} : { accept },
	})
}

describe("prefersMarkdown", () => {
	test("aceita o tipo explícito", () => {
		expect(prefersMarkdown(get("text/markdown"))).toBe(true)
		expect(prefersMarkdown(get("text/x-markdown"))).toBe(true)
	})

	test("navegador comum não é tratado como agente", () => {
		expect(prefersMarkdown(get("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"))).toBe(false)
	})

	test("HTML com q maior vence o markdown", () => {
		expect(prefersMarkdown(get("text/markdown;q=0.5,text/html;q=0.9"))).toBe(false)
	})

	test("markdown com q maior vence o HTML", () => {
		expect(prefersMarkdown(get("text/markdown;q=0.9,text/html;q=0.5"))).toBe(true)
	})

	test("empate resolve a favor do markdown, que foi pedido de propósito", () => {
		expect(prefersMarkdown(get("text/markdown,text/html"))).toBe(true)
	})

	test("q=0 descarta o tipo", () => {
		expect(prefersMarkdown(get("text/markdown;q=0"))).toBe(false)
	})

	test("Accept ausente ou coringa não dispara markdown", () => {
		expect(prefersMarkdown(get(null))).toBe(false)
		expect(prefersMarkdown(get("*/*"))).toBe(false)
	})

	// Server functions postam com Accept de dados e não podem virar markdown.
	test("só GET e HEAD", () => {
		expect(prefersMarkdown(get("text/markdown", "POST"))).toBe(false)
		expect(prefersMarkdown(get("text/markdown", "HEAD"))).toBe(true)
	})
})

describe("isUnsupportedAcceptResponse", () => {
	test("reconhece o 500 exato do TanStack Start", async () => {
		const response = Response.json({ error: "Only HTML requests are supported here" }, { status: 500 })
		expect(await isUnsupportedAcceptResponse(response)).toBe(true)
	})

	test("não confunde com outro erro 500 em JSON", async () => {
		const response = Response.json({ error: "database unreachable" }, { status: 500 })
		expect(await isUnsupportedAcceptResponse(response)).toBe(false)
	})

	test("ignora respostas de sucesso", async () => {
		expect(await isUnsupportedAcceptResponse(new Response("ok"))).toBe(false)
	})

	test("não consome o corpo original", async () => {
		const response = Response.json({ error: "Only HTML requests are supported here" }, { status: 500 })
		await isUnsupportedAcceptResponse(response)
		expect(response.bodyUsed).toBe(false)
	})
})

describe("notAcceptableResponse", () => {
	test("406 com os documentos de descoberta e Vary", async () => {
		const response = notAcceptableResponse(get("application/json"), DOCS)
		expect(response.status).toBe(406)
		expect(response.headers.get("vary")).toBe("Accept")

		const body = await response.text()
		expect(body).toContain("application/json")
		expect(body).toContain("/llms.txt")
		expect(body).toContain("/sitemap.xml")
	})
})

describe("withDiscoveryLinks", () => {
	const header = buildDiscoveryLinkHeader(DOCS)

	test("anexa em resposta de documento", () => {
		const response = new Response("<html></html>", { headers: { "content-type": "text/html; charset=utf-8" } })
		expect(withDiscoveryLinks(response, header).headers.get("link")).toContain('rel="describedby"')
	})

	// Chamadas de server function são frequentes; centenas de bytes por RPC não pagam.
	test("não anexa em resposta que não é documento", () => {
		const response = new Response("{}", { headers: { "content-type": "application/octet-stream" } })
		expect(withDiscoveryLinks(response, header).headers.get("link")).toBeNull()
	})

	test("preserva Link já emitido para preload de assets", () => {
		const response = new Response("<html></html>", {
			headers: { "content-type": "text/html", link: "</app.css>; rel=preload; as=style" },
		})
		const link = withDiscoveryLinks(response, header).headers.get("link")
		expect(link).toContain("</app.css>; rel=preload; as=style")
		expect(link).toContain("/llms.txt")
	})

	test("sem documentos, não mexe na resposta", () => {
		const response = new Response("<html></html>", { headers: { "content-type": "text/html" } })
		expect(withDiscoveryLinks(response, "").headers.get("link")).toBeNull()
	})

	test("preserva status e statusText", () => {
		const response = new Response("<html></html>", { status: 404, statusText: "Not Found", headers: { "content-type": "text/html" } })
		const wrapped = withDiscoveryLinks(response, header)
		expect(wrapped.status).toBe(404)
		expect(wrapped.statusText).toBe("Not Found")
	})
})
