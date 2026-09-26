import { describe, expect, it } from "vitest"
import { isScopeInPath, normalizePath, presentedPath, scopeUrl } from "@/lib/nav-paths"

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

describe("presentedPath", () => {
	it("durante a troca de módulo, fica na página montada", () => {
		expect(presentedPath("/unit", "/storage/920/dashboard")).toBe("/storage/920/dashboard")
	})

	it("URL sem rota dentro da página montada é a própria página", () => {
		expect(presentedPath("/unit/7/nao-existe", "/unit/7")).toBe("/unit/7/nao-existe")
		expect(presentedPath("/unit/7/", "/unit/7")).toBe("/unit/7/")
	})

	it("prefixo sem fronteira de segmento não conta como dentro", () => {
		expect(presentedPath("/unit/70/dashboard", "/unit/7")).toBe("/unit/7")
	})

	it("sem match montado, usa a URL pedida", () => {
		expect(presentedPath("/hub", undefined)).toBe("/hub")
	})
})

describe("isScopeInPath", () => {
	it("aceita o escopo na posição dele", () => {
		expect(isScopeInPath("/storage/920/dashboard", 920)).toBe(true)
		expect(isScopeInPath("/messhall/237/", 237)).toBe(true)
	})

	it("recusa escopo de outro id ou URL sem escopo", () => {
		expect(isScopeInPath("/unit/1065/dashboard", 920)).toBe(false)
		expect(isScopeInPath("/unit", 920)).toBe(false)
	})
})
