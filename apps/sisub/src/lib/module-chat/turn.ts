/**
 * Leitura do turno do chat dos módulos a partir das `UIMessage` do `@tanstack/ai-client`.
 *
 * Puro de propósito: o hook (`useModuleChatSession`) decide QUANDO gravar; aqui mora O QUE
 * gravar, testável sem React.
 *
 * Por que o turno, e não a mensagem do `onFinish`: com aprovação humana, o turno vira dois
 * runs. O primeiro para no interrupt com a call de escrita numa mensagem do assistente; o
 * segundo, depois da decisão, devolve o resultado NAQUELA mensagem e escreve a resposta numa
 * mensagem nova. O `onFinish` só entrega a última — gravar só ela perdia a ação do histórico.
 */

import { MODULE_CHAT_TERMINAL_TOOL_STATUSES } from "@iefa/sisub-domain/schemas"
import type { UIMessage } from "@tanstack/ai-client"
import type { ToolCall } from "@/types/domain/module-chat"

type Parts = UIMessage["parts"]

/** Forma do part `tool-call` que este módulo lê. O tipo da lib é genérico por tool. */
type ToolCallPartView = {
	type: "tool-call"
	id: string
	name: string
	arguments: string
	output?: unknown
	approval?: { id: string; needsApproval: boolean; approved?: boolean }
}

function filterToolCallParts(parts: Parts): ToolCallPartView[] {
	return parts.filter((p) => p.type === "tool-call") as unknown as ToolCallPartView[]
}

export function extractText(parts: Parts): string {
	return parts
		.filter((p): p is { type: "text"; content: string } => p.type === "text")
		.map((p) => p.content)
		.join("")
}

/** A ação espera Confirmar/Recusar: pediu aprovação e ninguém respondeu ainda. */
function isAwaitingApproval(part: ToolCallPartView): boolean {
	return part.approval?.needsApproval === true && part.approval.approved === undefined
}

export function extractToolCalls(parts: Parts): ToolCall[] {
	return filterToolCallParts(parts).map((tc) => {
		const base = { id: tc.id, name: tc.name, arguments: tc.arguments }
		// A recusa vem antes do resultado: o servidor devolve um `{ error }` para a call recusada,
		// e mostrá-lo como "Erro" faria a decisão do usuário parecer falha do sistema.
		if (tc.approval?.approved === false) return { ...base, status: "denied" } satisfies ToolCall
		if (isAwaitingApproval(tc)) return { ...base, status: "awaiting-approval", approvalId: tc.approval?.id } satisfies ToolCall

		const hasOutput = tc.output !== undefined && tc.output !== null
		const hasError = hasOutput && typeof tc.output === "object" && "error" in (tc.output as object)
		if (!hasOutput) return { ...base, status: "calling" } satisfies ToolCall
		if (hasError) {
			return { ...base, status: "error", error: String((tc.output as { error?: unknown }).error ?? "Erro desconhecido"), isError: true } satisfies ToolCall
		}
		return { ...base, status: "done", result: tc.output } satisfies ToolCall
	})
}

/** Os mesmos status que o `SaveModuleChatMessageSchema` aceita como payload de linha. */
const TERMINAL_STATUSES: ReadonlySet<ToolCall["status"]> = new Set(MODULE_CHAT_TERMINAL_TOOL_STATUSES)

export function hasTerminalToolCall(toolCalls: readonly ToolCall[]): boolean {
	return toolCalls.some((tc) => TERMINAL_STATUSES.has(tc.status))
}

export function hasMessagePayload(content: string, toolCalls: readonly ToolCall[]): boolean {
	return content.trim().length > 0 || hasTerminalToolCall(toolCalls)
}

/** Alguma ação de escrita da conversa ainda espera Confirmar/Recusar. */
export function hasAwaitingApproval(messages: readonly UIMessage[]): boolean {
	return messages.some((m) => m.role === "assistant" && filterToolCallParts(m.parts).some(isAwaitingApproval))
}

/** Mensagens do assistente do turno corrente: tudo depois da última mensagem do usuário. */
function selectCurrentTurnAssistantMessages(messages: readonly UIMessage[]): UIMessage[] {
	let lastUser = -1
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "user") {
			lastUser = i
			break
		}
	}
	return messages.slice(lastUser + 1).filter((m) => m.role === "assistant")
}

export interface TurnRecord {
	content: string
	toolCalls: ToolCall[]
}

/**
 * O turno inteiro numa linha do histórico: o texto das mensagens do assistente, na ordem, e
 * todas as chamadas de ferramenta. `null` quando não há nada que valha uma linha (o mesmo
 * critério do CHECK `module_chat_message_has_payload`).
 */
export function collectTurnRecord(messages: readonly UIMessage[]): TurnRecord | null {
	const assistant = selectCurrentTurnAssistantMessages(messages)
	const content = assistant
		.map((m) => extractText(m.parts).trim())
		.filter((text) => text.length > 0)
		.join("\n\n")
	const toolCalls = assistant.flatMap((m) => extractToolCalls(m.parts))
	if (!hasMessagePayload(content, toolCalls)) return null
	return { content, toolCalls }
}

/** Item de interrupt como o `useChat` expõe; só o que a decisão de aprovação usa. */
type InterruptView = { id: string; kind: string; resolveInterrupt?: (payload: unknown) => void }

/**
 * Responde o interrupt `approval_<toolCallId>` com `{ approved }` — e só isso: a rota recusa
 * `editedArgs` e qualquer outra forma.
 *
 * Sem as definições das tools no cliente, o `@tanstack/ai-client` não reconhece o interrupt
 * como `tool-approval` e o expõe como `generic`; o `addToolApprovalResponse` então só atualiza
 * o cartão e não manda nada. Quem dispara o turno seguinte (`resume` + `parentRunId`) é esta
 * resolução. Devolve `false` quando o interrupt não está mais pendente (decisão repetida).
 */
export function resolveApprovalInterrupt(interrupts: readonly InterruptView[], approvalId: string, approved: boolean): boolean {
	const item = interrupts.find((candidate) => candidate.id === approvalId)
	if (item?.kind !== "generic" || typeof item.resolveInterrupt !== "function") return false
	item.resolveInterrupt({ approved })
	return true
}

// ── Quando gravar ───────────────────────────────────────────────────────────

/**
 * Estado do turno para a gravação no histórico.
 *
 * `open`: o usuário mandou mensagem e a resposta ainda não foi gravada.
 * `sawLoading`: houve um ciclo de stream desde a última parada. Sem ele, o render entre o
 * clique em Confirmar e o início do run da decisão (não carregando, nada pendente) gravaria o
 * turno pela metade.
 */
export interface TurnState {
	open: boolean
	sawLoading: boolean
}

export const CLOSED_TURN: TurnState = { open: false, sawLoading: false }
export const OPENED_TURN: TurnState = { open: true, sawLoading: false }

/**
 * Um passo da máquina, a cada render do hook. Grava uma vez por turno, quando o stream PARA e
 * nada espera decisão. A parada no interrupt de aprovação não grava: a ação ainda não
 * aconteceu, e uma linha gravada ali apareceria ao recarregar como se tivesse executado.
 */
export function stepTurn(turn: TurnState, view: { isLoading: boolean; awaitingApproval: boolean }): { turn: TurnState; persist: boolean } {
	if (view.isLoading) return { turn: turn.open ? { open: true, sawLoading: true } : turn, persist: false }
	if (!turn.open || !turn.sawLoading) return { turn, persist: false }
	// Parada no interrupt: exige um novo ciclo de stream (o da decisão) antes de gravar.
	if (view.awaitingApproval) return { turn: { open: true, sawLoading: false }, persist: false }
	return { turn: CLOSED_TURN, persist: true }
}
