import { describe, expect, test } from "bun:test"
import { SaveModuleChatMessageSchema } from "./chat.ts"

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
