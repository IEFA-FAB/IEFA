import { describe, expect, test } from "bun:test"
import { MAX_CHAT_CONTENT_CHARS, MAX_CHAT_JSON_CHARS, SaveAnalyticsChatMessageSchema, SaveModuleChatMessageSchema } from "./chat.ts"

const SESSION = "550e8400-e29b-41d4-a716-446655440000"

function assistantWith(status: string) {
	return {
		sessionId: SESSION,
		role: "assistant" as const,
		content: "",
		toolCalls: [{ id: "call_1", name: "remove_menu_item", arguments: "{}", status }],
	}
}

describe("SaveModuleChatMessageSchema", () => {
	test("ação recusada pelo usuário é terminal: a mensagem só com ela vai ao histórico", () => {
		// Sem isso a recusa sumia do histórico ao recarregar, e a conversa ficava sem a ação
		// que o modelo propôs e o usuário negou.
		expect(SaveModuleChatMessageSchema.safeParse(assistantWith("denied")).success).toBe(true)
	})

	test("done e error continuam terminais", () => {
		expect(SaveModuleChatMessageSchema.safeParse(assistantWith("done")).success).toBe(true)
		expect(SaveModuleChatMessageSchema.safeParse(assistantWith("error")).success).toBe(true)
	})

	test("call ainda em execução ou esperando aprovação não é payload", () => {
		expect(SaveModuleChatMessageSchema.safeParse(assistantWith("calling")).success).toBe(false)
		expect(SaveModuleChatMessageSchema.safeParse(assistantWith("awaiting-approval")).success).toBe(false)
	})

	test("texto basta, mesmo com call pendente junto", () => {
		expect(SaveModuleChatMessageSchema.safeParse({ ...assistantWith("awaiting-approval"), content: "Vou remover o item." }).success).toBe(true)
	})
})

describe("tetos do corpo da mensagem", () => {
	const base = { sessionId: SESSION, role: "assistant" as const }

	test("texto no teto passa; acima é recusado, nos dois chats", () => {
		const atLimit = "a".repeat(MAX_CHAT_CONTENT_CHARS)
		const over = `${atLimit}a`
		expect(SaveModuleChatMessageSchema.safeParse({ ...base, content: atLimit }).success).toBe(true)
		expect(SaveModuleChatMessageSchema.safeParse({ ...base, content: over }).success).toBe(false)
		expect(SaveAnalyticsChatMessageSchema.safeParse({ ...base, content: atLimit }).success).toBe(true)
		expect(SaveAnalyticsChatMessageSchema.safeParse({ ...base, content: over }).success).toBe(false)
	})

	test("gráfico de 500 linhas cabe; jsonb gigante é recusado", () => {
		const data = Array.from({ length: 500 }, (_, i) => ({ mes: `2026-${i}`, refeitorio: "Refeitório de Oficiais da Base Aérea", total: i * 1000 }))
		const chart = { type: "bar", title: "t", xAxisKey: "mes", series: [{ key: "total", label: "Total" }], data, sql: "select 1" }
		expect(SaveAnalyticsChatMessageSchema.safeParse({ ...base, content: "", chart }).success).toBe(true)

		const huge = { blob: "x".repeat(MAX_CHAT_JSON_CHARS) }
		expect(SaveAnalyticsChatMessageSchema.safeParse({ ...base, content: "", chart: huge }).success).toBe(false)
		expect(SaveModuleChatMessageSchema.safeParse({ ...base, content: "ok", toolCalls: [huge] }).success).toBe(false)
		expect(SaveModuleChatMessageSchema.safeParse({ ...base, role: "tool", content: "", toolResult: huge }).success).toBe(false)
	})

	test("rótulos e erro têm teto", () => {
		expect(SaveModuleChatMessageSchema.safeParse({ ...base, content: "ok", toolName: "x".repeat(201) }).success).toBe(false)
		expect(SaveModuleChatMessageSchema.safeParse({ ...base, content: "ok", model: "x".repeat(201) }).success).toBe(false)
		expect(SaveAnalyticsChatMessageSchema.safeParse({ ...base, content: "", error: "x".repeat(16_001) }).success).toBe(false)
	})
})
