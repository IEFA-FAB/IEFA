import { describe, expect, test } from "vitest"
import { MCP_KEY_EXPIRY_WARNING_DAYS, mcpKeyExpiry } from "./mcp-key-expiry"

const NOW = Date.parse("2026-09-12T12:00:00.000Z")
const DAY = 24 * 60 * 60 * 1000

function inDays(days: number): string {
	return new Date(NOW + days * DAY).toISOString()
}

describe("estado de vencimento da chave de API", () => {
	test("chave longe do prazo não é destaque nenhum", () => {
		const state = mcpKeyExpiry(inDays(200), NOW)
		expect(state.isExpired).toBe(false)
		expect(state.isNear).toBe(false)
		expect(state.days).toBe(200)
	})

	test("dentro da janela de aviso vira destaque", () => {
		const state = mcpKeyExpiry(inDays(10), NOW)
		expect(state.isNear).toBe(true)
		expect(state.days).toBe(10)
	})

	test("a fronteira da janela é inclusiva, e o dia seguinte a ela não é", () => {
		expect(mcpKeyExpiry(inDays(MCP_KEY_EXPIRY_WARNING_DAYS), NOW).isNear).toBe(true)
		expect(mcpKeyExpiry(inDays(MCP_KEY_EXPIRY_WARNING_DAYS + 1), NOW).isNear).toBe(false)
	})

	test("chave que vence em horas ainda conta como 1 dia, não como vencida", () => {
		// Truncar faria a tela dizer "vence em 0 dias" numa chave que ainda autentica — e
		// "0 dias" lê como "já era".
		const state = mcpKeyExpiry(new Date(NOW + 20 * 60 * 60 * 1000).toISOString(), NOW)
		expect(state.days).toBe(1)
		expect(state.isExpired).toBe(false)
		expect(state.isNear).toBe(true)
	})

	test("o instante exato do vencimento já é vencida", () => {
		const state = mcpKeyExpiry(new Date(NOW).toISOString(), NOW)
		expect(state.isExpired).toBe(true)
		// Vencida nunca é "próxima do vencimento": o destaque de aviso prévio some, e o que a
		// tela mostra é o fato consumado.
		expect(state.isNear).toBe(false)
	})

	test("chave vencida há tempo continua vencida, sem virar número positivo", () => {
		const state = mcpKeyExpiry(inDays(-45), NOW)
		expect(state.isExpired).toBe(true)
		expect(state.days).toBe(-45)
	})
})
