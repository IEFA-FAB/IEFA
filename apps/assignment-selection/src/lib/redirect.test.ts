import { describe, expect, it } from "vitest"
import { isInternalPath, safeRedirect } from "./redirect"

describe("isInternalPath / safeRedirect (open-redirect guard)", () => {
	it("aceita caminhos internos", () => {
		for (const p of ["/", "/controller", "/controller?edition=abc", "/a/b/c"]) {
			expect(isInternalPath(p)).toBe(true)
			expect(safeRedirect(p)).toBe(p)
		}
	})

	it("rejeita URLs absolutas externas", () => {
		for (const p of ["https://evil.com", "http://evil.com", "ftp://x", "javascript:alert(1)", "mailto:x@y.z"]) {
			expect(isInternalPath(p)).toBe(false)
			expect(safeRedirect(p)).toBeUndefined()
		}
	})

	it("rejeita protocol-relative e backslash tricks (//evil, /\\evil)", () => {
		for (const p of ["//evil.com", "///evil.com", "/\\evil.com", "/\\/evil.com"]) {
			expect(isInternalPath(p)).toBe(false)
			expect(safeRedirect(p)).toBeUndefined()
		}
	})

	it("aceita /%2Fevil.com (boundary documentado: é seguro no SPA — o router trata como segmento literal, sem decode para //)", () => {
		expect(isInternalPath("/%2Fevil.com")).toBe(true)
		expect(safeRedirect("/%2Fevil.com")).toBe("/%2Fevil.com")
	})

	it("rejeita paths relativos sem barra inicial e valores não-string", () => {
		for (const p of ["controller", "", "evil.com", undefined, null, 42, {}, ["/x"]]) {
			expect(isInternalPath(p)).toBe(false)
			expect(safeRedirect(p)).toBeUndefined()
		}
	})
})
