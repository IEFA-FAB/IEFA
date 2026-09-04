import { describe, expect, it } from "bun:test"
import { isInternalPath, safeRedirect } from "./redirect.ts"

describe("isInternalPath / safeRedirect (guard de open redirect)", () => {
	it("aceita caminhos internos", () => {
		for (const path of ["/", "/hub", "/controller?edition=abc", "/a/b/c", "/recipes/a%2Fb"]) {
			expect(isInternalPath(path)).toBe(true)
			expect(safeRedirect(path)).toBe(path)
		}
	})

	it("rejeita URL absoluta e esquema executável", () => {
		for (const path of ["https://evil.com", "http://evil.com", "ftp://x", "javascript:alert(1)", "mailto:x@y.z"]) {
			expect(isInternalPath(path)).toBe(false)
			expect(safeRedirect(path)).toBeUndefined()
		}
	})

	it("rejeita protocol-relative e o truque da barra invertida", () => {
		for (const path of ["//evil.com", "///evil.com", "/\\evil.com", "/\\/evil.com"]) {
			expect(isInternalPath(path)).toBe(false)
			expect(safeRedirect(path)).toBeUndefined()
		}
	})

	it("rejeita autoridade escondida atrás de percent-encoding", () => {
		for (const path of ["/%2Fevil.com", "/%2f%2fevil.com", "/%5Cevil.com"]) {
			expect(isInternalPath(path)).toBe(false)
			expect(safeRedirect(path)).toBeUndefined()
		}
	})

	it("rejeita percent-encoding malformado em vez de adivinhar", () => {
		expect(isInternalPath("/%E0%A4%A")).toBe(false)
		expect(safeRedirect("/%zz")).toBeUndefined()
	})

	it("rejeita caminho relativo e valor não-string", () => {
		for (const value of ["hub", "", "evil.com", undefined, null, 42, {}, ["/x"]]) {
			expect(isInternalPath(value)).toBe(false)
			expect(safeRedirect(value)).toBeUndefined()
		}
	})
})
