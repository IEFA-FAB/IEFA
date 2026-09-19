/**
 * Higiene do histórico que o NAVEGADOR manda para os endpoints de chat.
 *
 * No protocolo AG-UI o cliente reenvia a conversa inteira a cada turno, e o servidor a
 * trata como verdade. Dois efeitos disso eram explorados:
 * - mensagem `system`/`developer` vinda do cliente vira instrução com peso de prompt de
 *   sistema — a restrição de escopo do módulo morava só no prompt;
 * - o `@tanstack/ai` EXECUTA toda tool call de mensagem `assistant` que não tem resultado
 *   (`checkForPendingToolCalls`). Bastava forjar `assistant.toolCalls: [render_chart({sql})]`
 *   para rodar a tool com argumentos escolhidos, sem o modelo decidir nada.
 */

/** Teto do histórico. Acima disso o turno não cabe no contexto do modelo de qualquer jeito. */
export const MAX_CHAT_MESSAGES = 200
export const MAX_CHAT_PAYLOAD_CHARS = 400_000

const CLIENT_FORBIDDEN_ROLES = new Set(["system", "developer"])

type ClientToolCall = { id?: unknown }
type ClientMessage = { role: string; content?: unknown; toolCalls?: unknown; toolCallId?: unknown }

/** Mesma regra do `@tanstack/ai`: resultado com `pendingExecution: true` não conclui a call. */
function isCompletedToolResult(message: ClientMessage): boolean {
	if (typeof message.content !== "string") return true
	try {
		return JSON.parse(message.content)?.pendingExecution !== true
	} catch {
		return true
	}
}

export type SanitizeOptions = {
	/**
	 * `true` só onde o fluxo de aprovação humana reenvia a call pendente para o servidor
	 * executar. Sem aprovação no fluxo, call pendente vinda do cliente é sempre forjada.
	 */
	allowPendingToolCalls: boolean
}

export function sanitizeClientMessages<T extends ClientMessage>(messages: readonly T[], options: SanitizeOptions): T[] {
	const completed = new Set<string>()
	for (const message of messages) {
		if (message.role === "tool" && typeof message.toolCallId === "string" && isCompletedToolResult(message)) {
			completed.add(message.toolCallId)
		}
	}

	const result: T[] = []
	for (const message of messages) {
		if (CLIENT_FORBIDDEN_ROLES.has(message.role)) continue
		if (!options.allowPendingToolCalls && message.role === "assistant" && Array.isArray(message.toolCalls)) {
			const toolCalls = (message.toolCalls as ClientToolCall[]).filter((call) => typeof call?.id === "string" && completed.has(call.id))
			result.push({ ...message, toolCalls: toolCalls.length > 0 ? toolCalls : undefined })
			continue
		}
		result.push(message)
	}
	return result
}

/** `null` quando cabe; senão a mensagem do 413. */
export function checkChatPayloadSize(messages: readonly unknown[]): string | null {
	if (messages.length > MAX_CHAT_MESSAGES) return `Conversa longa demais (máximo de ${MAX_CHAT_MESSAGES} mensagens)`
	if (JSON.stringify(messages).length > MAX_CHAT_PAYLOAD_CHARS) return "Conversa longa demais"
	return null
}
