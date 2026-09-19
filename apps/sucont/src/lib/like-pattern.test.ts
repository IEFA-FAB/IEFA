import { describe, expect, it } from "bun:test"
import { countLiteralSearchChars, escapeLikePattern } from "#/lib/like-pattern"

describe("escapeLikePattern", () => {
	it("escapa os curingas do SQL e o próprio escape", () => {
		expect(escapeLikePattern("100%")).toBe("100\\%")
		expect(escapeLikePattern("A_1")).toBe("A\\_1")
		expect(escapeLikePattern("a\\b")).toBe("a\\\\b")
	})

	it("remove o asterisco, que o PostgREST converte em curinga sem escape", () => {
		expect(escapeLikePattern("KLE*")).toBe("KLE")
	})

	it("não mexe em texto comum", () => {
		expect(escapeLikePattern("KLEBSON")).toBe("KLEBSON")
		expect(escapeLikePattern("D'ÁVILA")).toBe("D'ÁVILA")
	})
})

describe("countLiteralSearchChars", () => {
	it("não conta curinga nem espaço", () => {
		expect(countLiteralSearchChars("%%%")).toBe(0)
		expect(countLiteralSearchChars("a_%")).toBe(1)
		expect(countLiteralSearchChars("***")).toBe(0)
		expect(countLiteralSearchChars("  a  ")).toBe(1)
	})

	it("conta o nome inteiro", () => {
		expect(countLiteralSearchChars("SILVA")).toBe(5)
	})
})
