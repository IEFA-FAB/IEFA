import { describe, expect, test } from "bun:test"
import { containsPattern, escapeLikePattern } from "./like.ts"

describe("escapeLikePattern", () => {
	test("escapa os curingas e a própria barra", () => {
		expect(escapeLikePattern("50%_off\\x")).toBe("50\\%\\_off\\\\x")
	})

	test("texto comum passa intacto", () => {
		expect(escapeLikePattern("Arroz à grega")).toBe("Arroz à grega")
	})

	test("containsPattern envolve o termo escapado", () => {
		expect(containsPattern("%")).toBe("%\\%%")
	})
})
