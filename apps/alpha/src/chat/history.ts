/**
 * Histórico reenviado ao modelo a cada turno.
 *
 * Só pares completos: a pergunta e a resposta `complete` que a RESPONDE (`reply_to`). Parear
 * pela ordem das linhas falhava com dois turnos simultâneos na mesma conversa (duas abas):
 * [P1, P2, R1, R2] virava "P2 respondida por R1". Pergunta sem resposta completa — o turno
 * caiu (`aborted`/`error`) ou ainda está em andamento — sai do histórico: reenviá-la faria o
 * modelo responder duas perguntas de uma vez. Continua na TELA, que lê a conversa inteira.
 *
 * Os rótulos de citação saem do texto: `[N1]` de um turno antigo aponta para um trecho que
 * não está no contexto de agora, e o modelo o reutilizaria como se estivesse.
 */

import { stripCitationLabels } from "./citations.ts"

export const HISTORY_MESSAGES = 12

export type StoredMessage = {
	id: string
	role: "user" | "assistant"
	content: string
	status: "complete" | "aborted" | "error"
	reply_to: string | null
	created_at: string
}

export function buildHistory(messages: readonly StoredMessage[], limit = HISTORY_MESSAGES): Array<{ role: "user" | "assistant"; content: string }> {
	const answers = new Map<string, StoredMessage>()
	for (const message of messages) {
		if (message.role === "assistant" && message.reply_to && message.status === "complete" && message.content.trim()) answers.set(message.reply_to, message)
	}

	const pairs: Array<{ role: "user" | "assistant"; content: string }> = []
	for (const question of messages) {
		if (question.role !== "user") continue
		const answer = answers.get(question.id)
		if (!answer) continue
		pairs.push({ role: "user", content: question.content }, { role: "assistant", content: stripCitationLabels(answer.content) })
	}
	// Corta por par, nunca no meio de um: o histórico tem de começar numa pergunta.
	const keep = Math.max(0, limit - (limit % 2))
	return pairs.slice(Math.max(0, pairs.length - keep))
}

/**
 * Há um turno em andamento nesta conversa? Pergunta sem resposta nenhuma (nem `aborted` nem
 * `error`), feita há menos que o teto de um turno. Um segundo turno ao mesmo tempo pagaria o
 * modelo duas vezes pelo mesmo contexto, e a segunda resposta não enxergaria a primeira.
 */
export function hasTurnInProgress(messages: readonly StoredMessage[], now: Date, turnTimeoutMs: number): boolean {
	const answered = new Set(messages.filter((message) => message.role === "assistant" && message.reply_to).map((message) => message.reply_to))
	return messages.some(
		(message) => message.role === "user" && !answered.has(message.id) && now.getTime() - new Date(message.created_at).getTime() < turnTimeoutMs
	)
}
