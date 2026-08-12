import { describe, expect, test } from "bun:test"
import { AGENT_LIST_DEFAULT, AGENT_LIST_MAX, clampLimit, enforcePayloadBudget, MAX_TOOL_RESULT_CHARS, PayloadTooLargeError } from "./index.ts"

describe("clampLimit", () => {
	test("ausente ou ilegível cai no padrão", () => {
		expect(clampLimit(undefined)).toBe(AGENT_LIST_DEFAULT)
		expect(clampLimit(null)).toBe(AGENT_LIST_DEFAULT)
		expect(clampLimit("muitos")).toBe(AGENT_LIST_DEFAULT)
		expect(clampLimit(Number.NaN)).toBe(AGENT_LIST_DEFAULT)
	})

	test("grampeia a faixa e trunca fracionário", () => {
		expect(clampLimit(0)).toBe(1)
		expect(clampLimit(-5)).toBe(1)
		expect(clampLimit(5)).toBe(5)
		expect(clampLimit(12.7)).toBe(12)
		expect(clampLimit(9999)).toBe(AGENT_LIST_MAX)
	})

	test("aceita padrão e teto próprios", () => {
		expect(clampLimit(undefined, 10, 20)).toBe(10)
		expect(clampLimit(50, 10, 20)).toBe(20)
	})
})

describe("enforcePayloadBudget", () => {
	test("payload dentro do teto passa pela mesma referência", () => {
		const data = { recipes: [{ id: "1", name: "Arroz" }], total: 1 }
		expect(enforcePayloadBudget("list_recipes", data)).toBe(data)
	})

	test("payload acima do teto vira erro que diz o que estreitar", () => {
		// Formato do bug real: catálogo inteiro numa listagem. No chat eram 10,6 MB e no
		// MCP 10,9 MB — os dois provedores recusavam o turno seguinte com 413.
		const huge = Array.from({ length: 2000 }, (_, i) => ({ id: `id-${i}`, description: "x".repeat(200) }))
		expect(JSON.stringify(huge).length).toBeGreaterThan(MAX_TOOL_RESULT_CHARS)

		expect(() => enforcePayloadBudget("list_recipes", huge)).toThrow(PayloadTooLargeError)
		try {
			enforcePayloadBudget("list_recipes", huge)
		} catch (e) {
			const err = e as PayloadTooLargeError
			expect(err.code).toBe("PAYLOAD_TOO_LARGE")
			expect(err.toolName).toBe("list_recipes")
			expect(err.message).toContain("list_recipes")
			expect(err.message).toMatch(/reduza o limit/i)
		}
	})

	test("o teto é o mesmo para todos os consumidores", () => {
		// Chat dos módulos e servidor MCP importam esta constante — nenhum define a sua.
		expect(MAX_TOOL_RESULT_CHARS).toBe(24_000)
	})
})
