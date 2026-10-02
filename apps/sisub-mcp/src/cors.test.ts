import { describe, expect, test } from "bun:test"
import { corsHeadersFor, evaluateOrigin, parseAllowedOrigins } from "./cors.ts"

describe("parseAllowedOrigins", () => {
	test("vazio ou ausente = nenhuma origem de navegador", () => {
		expect(parseAllowedOrigins(undefined).size).toBe(0)
		expect(parseAllowedOrigins("").size).toBe(0)
		expect(parseAllowedOrigins(" , ").size).toBe(0)
	})

	test("normaliza para a origem serializada (espaço, barra final, caixa do host, porta padrão)", () => {
		const origins = parseAllowedOrigins(" https://Inspector.Exemplo.com.br/ , http://localhost:6274,https://a.com:443")
		expect([...origins].sort()).toEqual(["http://localhost:6274", "https://a.com", "https://inspector.exemplo.com.br"])
	})

	test("recusa curinga: reabriria o buraco que a política fecha", () => {
		expect(() => parseAllowedOrigins("https://a.com,*")).toThrow('"*" não é aceito')
	})

	test("recusa entrada que não é origem http(s), em vez de ignorá-la em silêncio", () => {
		expect(() => parseAllowedOrigins("a.com")).toThrow("origem inválida")
		expect(() => parseAllowedOrigins("file:///tmp/x")).toThrow("origem inválida")
	})
})

describe("evaluateOrigin", () => {
	const allowed = parseAllowedOrigins("https://inspector.exemplo.com.br,http://localhost:6274")

	test("sem Origin (cliente de servidor/CLI) passa", () => {
		expect(evaluateOrigin(undefined, allowed)).toEqual({ kind: "absent" })
		expect(evaluateOrigin("", allowed)).toEqual({ kind: "absent" })
		// Mesmo sem lista nenhuma configurada.
		expect(evaluateOrigin(undefined, new Set())).toEqual({ kind: "absent" })
	})

	test("origem da lista passa, com o valor normalizado", () => {
		expect(evaluateOrigin("https://inspector.exemplo.com.br", allowed)).toEqual({ kind: "allowed", origin: "https://inspector.exemplo.com.br" })
		expect(evaluateOrigin("HTTPS://INSPECTOR.EXEMPLO.COM.BR", allowed)).toEqual({ kind: "allowed", origin: "https://inspector.exemplo.com.br" })
	})

	test("origem fora da lista é negada — inclusive mesmo host em outra porta ou esquema", () => {
		expect(evaluateOrigin("https://evil.example", allowed)).toEqual({ kind: "denied" })
		expect(evaluateOrigin("http://localhost:3000", allowed)).toEqual({ kind: "denied" })
		expect(evaluateOrigin("http://inspector.exemplo.com.br", allowed)).toEqual({ kind: "denied" })
	})

	test("Origin `null` (iframe sandbox, file://) e cabeçalho repetido são negados", () => {
		expect(evaluateOrigin("null", allowed)).toEqual({ kind: "denied" })
		expect(evaluateOrigin(["https://inspector.exemplo.com.br", "https://evil.example"], allowed)).toEqual({ kind: "denied" })
	})

	test("lista vazia nega qualquer origem de navegador", () => {
		expect(evaluateOrigin("https://inspector.exemplo.com.br", new Set())).toEqual({ kind: "denied" })
	})
})

describe("corsHeadersFor", () => {
	test("origem permitida recebe a PRÓPRIA origem, nunca `*`, e pode ler mcp-session-id", () => {
		const headers = corsHeadersFor({ kind: "allowed", origin: "https://inspector.exemplo.com.br" })
		expect(headers["Access-Control-Allow-Origin"]).toBe("https://inspector.exemplo.com.br")
		expect(headers["Access-Control-Expose-Headers"]).toContain("mcp-session-id")
		expect(headers["Access-Control-Allow-Headers"]).toContain("x-api-key")
		expect(headers.Vary).toBe("Origin")
	})

	test.each([[{ kind: "denied" } as const], [{ kind: "absent" } as const]])("%o não recebe Access-Control-Allow-*", (decision) => {
		const headers = corsHeadersFor(decision)
		expect(Object.keys(headers).filter((k) => k.startsWith("Access-Control-"))).toEqual([])
		expect(headers.Vary).toBe("Origin")
	})
})
