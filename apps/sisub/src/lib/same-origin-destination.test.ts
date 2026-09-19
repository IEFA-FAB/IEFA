import { describe, expect, test } from "vitest"
import { sameOriginDestination } from "./same-origin-destination"

const ORIGIN = "https://sisub.iefa.com.br"

describe("sameOriginDestination", () => {
	test("caminho interno passa, com query e hash", () => {
		expect(sameOriginDestination("/kitchen/3?tab=a#x", ORIGIN)).toBe("/kitchen/3?tab=a#x")
	})

	test("URL absoluta da mesma origem vira caminho", () => {
		expect(sameOriginDestination(`${ORIGIN}/hub`, ORIGIN)).toBe("/hub")
	})

	test.each([
		"https://evil.example/hub",
		"//evil.example/hub",
		"/\\evil.example",
		"javascript:alert(1)",
		"https://sisub.iefa.com.br.evil.example/",
		"http://sisub.iefa.com.br/hub",
	])("origem diferente cai no fallback: %s", (dest) => {
		expect(sameOriginDestination(dest, ORIGIN)).toBe("/hub")
	})

	test("caminho que o parser normaliza para protocol-relative cai no fallback", () => {
		for (const path of ["/.//evil.com", "/..//evil.com", "/%2e//evil.com"]) {
			expect(sameOriginDestination(path, "https://sisub.iefa.com.br")).toBe("/hub")
		}
	})

	test("vazio cai no fallback", () => {
		expect(sameOriginDestination("", ORIGIN)).toBe("/hub")
		expect(sameOriginDestination(undefined, ORIGIN, "/auth")).toBe("/auth")
	})
})
