import { describe, expect, it } from "bun:test"
import { ACANTHUS_VARIANTS, pickVariant } from "./variant"

describe("pickVariant", () => {
	it("?acanto= força a variante", () => {
		expect(pickVariant("?acanto=procedural", () => 0.99)).toBe("procedural")
		expect(pickVariant("?acanto=intendencia", () => 0)).toBe("intendencia")
		expect(pickVariant("?x=1&acanto=intendencia", () => 0)).toBe("intendencia")
	})

	it("valor desconhecido cai no sorteio", () => {
		expect(pickVariant("?acanto=outra", () => 0)).toBe(ACANTHUS_VARIANTS[0])
	})

	it("sorteia entre todas, meio a meio", () => {
		expect(pickVariant("", () => 0)).toBe("procedural")
		expect(pickVariant("", () => 0.49)).toBe("procedural")
		expect(pickVariant("", () => 0.5)).toBe("intendencia")
		expect(pickVariant("", () => 0.999999)).toBe("intendencia")
		// Math.random nunca devolve 1, mas um gerador ruim não quebra a escolha.
		expect(ACANTHUS_VARIANTS).toContain(pickVariant("", () => 1))
	})
})
