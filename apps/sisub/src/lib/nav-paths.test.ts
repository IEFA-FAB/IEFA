import { describe, expect, it } from "vitest"
import { normalizePath, scopeUrl } from "@/lib/nav-paths"

describe("normalizePath", () => {
	it("tira barras finais e mantém a raiz", () => {
		expect(normalizePath("/messhall/7/")).toBe("/messhall/7")
		expect(normalizePath("/")).toBe("/")
		expect(normalizePath("")).toBe("/")
	})
})

describe("scopeUrl", () => {
	it("põe o escopo depois do módulo", () => {
		expect(scopeUrl("/storage/receiving", "storage", 7)).toBe("/storage/7/receiving")
	})

	it("preserva a rota index do escopo", () => {
		expect(scopeUrl("/messhall/", "messhall", 32)).toBe("/messhall/32/")
	})

	it("não mexe em URL de outro módulo", () => {
		expect(scopeUrl("/global/ingredients", "storage", 7)).toBe("/global/ingredients")
	})
})
