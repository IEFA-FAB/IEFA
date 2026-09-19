import { describe, expect, it } from "bun:test"
import { isHttpUrl, resolveSameOriginDestination } from "#/lib/safe-url"

const ORIGIN = "https://sucont.iefa.com.br"

describe("resolveSameOriginDestination", () => {
	it("mantém caminho interno com query e hash", () => {
		expect(resolveSameOriginDestination("/auditor?divisao=sucont-4#topo", ORIGIN)).toBe("/auditor?divisao=sucont-4#topo")
		expect(resolveSameOriginDestination("/", ORIGIN)).toBe("/")
	})

	it("recusa caminho que o parser normaliza para protocol-relative", () => {
		for (const path of ["/.//evil.com", "/..//evil.com", "/%2e//evil.com"]) {
			expect(resolveSameOriginDestination(path, "https://sucont.iefa.com.br")).toBe("/")
		}
	})

	it("recusa destino fora da origem", () => {
		expect(resolveSameOriginDestination("//evil.com", ORIGIN)).toBe("/")
		expect(resolveSameOriginDestination("/\t/evil.com", ORIGIN)).toBe("/")
		expect(resolveSameOriginDestination("/\\evil.com", ORIGIN)).toBe("/")
		expect(resolveSameOriginDestination("https://evil.com/x", ORIGIN)).toBe("/")
		expect(resolveSameOriginDestination("https://sucont.iefa.com.br.evil.com/", ORIGIN)).toBe("/")
	})

	it("recusa esquema que não é da origem", () => {
		expect(resolveSameOriginDestination("javascript:alert(1)", ORIGIN)).toBe("/")
		expect(resolveSameOriginDestination("data:text/html,<script>alert(1)</script>", ORIGIN)).toBe("/")
	})

	it("usa o fallback informado", () => {
		expect(resolveSameOriginDestination("//evil.com", ORIGIN, "/hub")).toBe("/hub")
	})
})

describe("isHttpUrl", () => {
	it("aceita http e https", () => {
		expect(isHttpUrl("https://app.powerbi.com/view?r=abc")).toBe(true)
		expect(isHttpUrl("http://intranet.fab.mil.br/relatorio")).toBe(true)
	})

	it("recusa outros esquemas e texto que não é URL", () => {
		expect(isHttpUrl("javascript:alert(1)")).toBe(false)
		expect(isHttpUrl("JaVaScRiPt:alert(1)")).toBe(false)
		expect(isHttpUrl("data:text/html,x")).toBe(false)
		expect(isHttpUrl("/relatorios")).toBe(false)
		expect(isHttpUrl("relatorio")).toBe(false)
	})
})
