import { describe, expect, test } from "bun:test"
import { isInternalHref, safeHref } from "./safe-href"

describe("safeHref", () => {
	test("aceita http, https, mailto e caminho interno", () => {
		for (const href of ["https://www.fab.mil.br/", "http://example.com/a?b=1", "mailto:iefa@fab.mil.br", "/journal", "/posts/abc#topo"]) {
			expect(safeHref(href)).toBe(href)
		}
		expect(safeHref("  https://x.com  ")).toBe("https://x.com")
	})

	test("recusa esquema executável ou fora da lista", () => {
		for (const href of [
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			" javascript:alert(1)",
			"java\tscript:alert(1)",
			"java\nscript:alert(1)",
			"data:text/html,<script>alert(1)</script>",
			"vbscript:msgbox(1)",
			"file:///etc/passwd",
			"tel:123",
		]) {
			expect(safeHref(href)).toBeUndefined()
		}
	})

	test("aceita âncora e query da própria página", () => {
		expect(safeHref("#metodologia")).toBe("#metodologia")
		expect(safeHref("?q=x")).toBe("?q=x")
		expect(safeHref("#a\tb")).toBeUndefined()
	})

	test("recusa o que o navegador lê como outro domínio ou não é URL", () => {
		for (const href of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/%2Fevil.com", "evil.com", "", "   "]) {
			expect(safeHref(href)).toBeUndefined()
		}
		expect(safeHref(undefined)).toBeUndefined()
		expect(safeHref(42)).toBeUndefined()
	})

	test("isInternalHref", () => {
		expect(isInternalHref("/journal")).toBe(true)
		expect(isInternalHref("#topo")).toBe(true)
		expect(isInternalHref("//evil.com")).toBe(false)
		expect(isInternalHref("/\t/evil.com")).toBe(false)
		expect(isInternalHref("https://x.com")).toBe(false)
	})
})
