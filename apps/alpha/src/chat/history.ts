/**
 * Histórico reenviado ao modelo a cada turno.
 *
 * Só pares completos: pergunta seguida de resposta `complete`. Pergunta cujo turno caiu
 * (`aborted`/`error`) sai do histórico — reenviá-la sem resposta faria o modelo responder
 * duas perguntas de uma vez no turno seguinte. Continua na TELA, que lê a conversa inteira.
 *
 * Os rótulos de citação saem do texto: `[N1]` de um turno antigo aponta para um trecho que
 * não está no contexto de agora, e o modelo o reutilizaria como se estivesse.
 */

import { stripCitationLabels } from "./citations.ts"

export const HISTORY_MESSAGES = 12

export type StoredMessage = { role: "user" | "assistant"; content: string; status: "complete" | "aborted" | "error" }

export function buildHistory(messages: readonly StoredMessage[], limit = HISTORY_MESSAGES): Array<{ role: "user" | "assistant"; content: string }> {
	const pairs: Array<{ role: "user" | "assistant"; content: string }> = []
	for (let i = 0; i < messages.length - 1; i += 1) {
		const question = messages[i]
		const answer = messages[i + 1]
		if (question.role !== "user" || answer.role !== "assistant" || answer.status !== "complete" || !answer.content.trim()) continue
		pairs.push({ role: "user", content: question.content }, { role: "assistant", content: stripCitationLabels(answer.content) })
		i += 1
	}
	// Corta por par, nunca no meio de um: o histórico tem de começar numa pergunta.
	const keep = Math.max(0, limit - (limit % 2))
	return pairs.slice(Math.max(0, pairs.length - keep))
}
