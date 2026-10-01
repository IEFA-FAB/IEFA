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

import { dropClientSystemMessages } from "@iefa/ai-provider/untrusted"

/** Teto do histórico. Acima disso o turno não cabe no contexto do modelo de qualquer jeito. */
export const MAX_CHAT_MESSAGES = 200
export const MAX_CHAT_PAYLOAD_CHARS = 400_000

type ClientToolCall = { id?: unknown; function?: { name?: unknown } }
type ClientMessage = { role: string; content?: unknown; toolCalls?: unknown; toolCallId?: unknown }

/**
 * Id vazio NÃO conclui call nenhuma: o `@tanstack/ai` testa `message.toolCallId &&`, então
 * uma call `id: ""` com resultado `toolCallId: ""` segue pendente para ele — e executada.
 */
function isNonEmptyId(value: unknown): value is string {
	return typeof value === "string" && value.length > 0
}

/** Mesma regra do `@tanstack/ai`: resultado com `pendingExecution: true` não conclui a call. */
function isCompletedToolResult(message: ClientMessage): boolean {
	if (typeof message.content !== "string") return true
	try {
		return JSON.parse(message.content)?.pendingExecution !== true
	} catch {
		return true
	}
}

// ── Aprovação humana (resume do AG-UI) ──────────────────────────────────────

/** Prefixo do interrupt de aprovação que o `@tanstack/ai` emite: `approval_<toolCallId>`. */
export const APPROVAL_INTERRUPT_PREFIX = "approval_"

/** A única forma de resume que a rota aceita: decisão sim/não sobre uma call pendente. */
export type ApprovalResumeEntry = {
	interruptId: string
	status: "resolved"
	payload: { approved: boolean }
}

/** Requisição malformada do cliente: vira 400 na rota, antes de abrir o stream. */
export class ChatRequestError extends Error {
	readonly status = 400
	constructor(message: string) {
		super(message)
		this.name = "ChatRequestError"
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
	return Object.keys(value).every((key) => allowed.includes(key))
}

/**
 * Valida o `resume` do AG-UI. Só passa `{ interruptId: "approval_<id>", status: "resolved",
 * payload: { approved: boolean } }`, e nada além disso.
 *
 * O `@tanstack/ai` aceita mais: `payload.editedArgs` faria a tool executar com argumentos
 * EDITADOS no navegador, diferentes dos que o cartão mostrou; `status: "cancelled"`, payload
 * booleano solto e `metadata` são caminhos que a tela do sisub não usa. Caminho que a tela não
 * usa é superfície sem dono — recusado com 400.
 */
export function parseApprovalResume(resume: unknown): ApprovalResumeEntry[] | undefined {
	if (resume === undefined) return undefined
	if (!Array.isArray(resume)) throw new ChatRequestError("Resposta de aprovação inválida")

	const seen = new Set<string>()
	return resume.map((entry: unknown) => {
		if (!isPlainObject(entry) || !hasOnlyKeys(entry, ["interruptId", "status", "payload"])) {
			throw new ChatRequestError("Resposta de aprovação inválida")
		}
		const { interruptId, status, payload } = entry
		if (typeof interruptId !== "string" || !interruptId.startsWith(APPROVAL_INTERRUPT_PREFIX) || interruptId.length <= APPROVAL_INTERRUPT_PREFIX.length) {
			throw new ChatRequestError("Resposta de aprovação inválida")
		}
		if (status !== "resolved") throw new ChatRequestError("Resposta de aprovação inválida")
		if (!isPlainObject(payload) || !hasOnlyKeys(payload, ["approved"]) || typeof payload.approved !== "boolean") {
			// `editedArgs` cai aqui: aprovar é sobre a call mostrada, não sobre outra.
			throw new ChatRequestError("A aprovação aceita só confirmar ou recusar a ação mostrada")
		}
		if (seen.has(interruptId)) throw new ChatRequestError("Resposta de aprovação duplicada")
		seen.add(interruptId)
		return { interruptId, status, payload: { approved: payload.approved } }
	})
}

export type SanitizeOptions =
	/** Sem aprovação no fluxo (analytics): call pendente vinda do cliente é sempre forjada. */
	| { allowPendingToolCalls: false }
	/**
	 * Fluxo com aprovação humana (chat dos módulos). Call pendente só sobrevive se a tool exige
	 * aprovação E o `resume` desta requisição traz a decisão sobre ela. Aprovada, o `chat()`
	 * executa; recusada, devolve ao modelo que o usuário não autorizou. Qualquer outra call
	 * pendente — de tool de leitura, ou de escrita sem decisão — é descartada.
	 */
	| { approvalTools: ReadonlySet<string>; resume: readonly ApprovalResumeEntry[] | undefined }

function toolCallName(call: ClientToolCall): string | undefined {
	const name = call?.function?.name
	return typeof name === "string" ? name : undefined
}

export function sanitizeClientMessages<T extends ClientMessage>(messages: readonly T[], options: SanitizeOptions): T[] {
	const completed = new Set<string>()
	for (const message of messages) {
		if (message.role === "tool" && isNonEmptyId(message.toolCallId) && isCompletedToolResult(message)) {
			completed.add(message.toolCallId)
		}
	}

	const decided = new Set<string>()
	if ("approvalTools" in options) {
		for (const entry of options.resume ?? []) decided.add(entry.interruptId.slice(APPROVAL_INTERRUPT_PREFIX.length))
	}
	const keepsPending = (call: ClientToolCall): boolean => {
		if (!("approvalTools" in options) || !isNonEmptyId(call?.id)) return false
		const name = toolCallName(call)
		return name !== undefined && options.approvalTools.has(name) && decided.has(call.id)
	}

	const result: T[] = []
	// `system`/`developer` saem pela mesma regra dos chats do portal e do sucont.
	for (const message of dropClientSystemMessages(messages)) {
		if (message.role === "assistant" && Array.isArray(message.toolCalls)) {
			const toolCalls = (message.toolCalls as ClientToolCall[]).filter((call) => (isNonEmptyId(call?.id) && completed.has(call.id)) || keepsPending(call))
			result.push({ ...message, toolCalls: toolCalls.length > 0 ? toolCalls : undefined })
			continue
		}
		result.push(message)
	}
	return result
}

/**
 * Toda decisão do `resume` tem de bater com uma call pendente que sobreviveu à higiene. Uma
 * aprovação "sobrando" (call de leitura, call já executada, id inventado) não tem o que
 * aprovar: o `chat()` a recusaria no meio do stream, sem status HTTP; aqui vira 400.
 *
 * Na RECUSA o navegador já manda um resultado `tool` para a call (`approved: false`); o
 * `@tanstack/ai` não o conta como conclusão quando o `resume` recusa a call, e troca o texto
 * pelo da recusa. A mesma regra vale aqui.
 */
export function assertResumeMatchesPending(messages: readonly ClientMessage[], resume: readonly ApprovalResumeEntry[] | undefined): void {
	if (!resume || resume.length === 0) return
	const denied = new Set(resume.filter((entry) => !entry.payload.approved).map((entry) => entry.interruptId.slice(APPROVAL_INTERRUPT_PREFIX.length)))
	const completed = new Set<string>()
	for (const message of messages) {
		if (message.role === "tool" && isNonEmptyId(message.toolCallId) && isCompletedToolResult(message) && !denied.has(message.toolCallId)) {
			completed.add(message.toolCallId)
		}
	}
	const awaiting = new Set<string>()
	for (const message of messages) {
		if (message.role !== "assistant" || !Array.isArray(message.toolCalls)) continue
		for (const call of message.toolCalls as ClientToolCall[]) {
			if (isNonEmptyId(call?.id) && !completed.has(call.id)) awaiting.add(call.id)
		}
	}
	for (const entry of resume) {
		if (!awaiting.has(entry.interruptId.slice(APPROVAL_INTERRUPT_PREFIX.length))) {
			throw new ChatRequestError("Aprovação sem ação pendente correspondente")
		}
	}
}

/** `null` quando cabe; senão a mensagem do 413. */
export function checkChatPayloadSize(messages: readonly unknown[]): string | null {
	if (messages.length > MAX_CHAT_MESSAGES) return `Conversa longa demais (máximo de ${MAX_CHAT_MESSAGES} mensagens)`
	if (JSON.stringify(messages).length > MAX_CHAT_PAYLOAD_CHARS) return "Conversa longa demais"
	return null
}
