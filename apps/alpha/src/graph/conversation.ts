/**
 * @module conversation
 * O histórico da conversa, no formato em que ele vira consulta de busca.
 *
 * A recuperação sempre buscou a ÚLTIMA mensagem crua. Numa conversa, boa parte das
 * perguntas não se sustenta sozinha: "e o prazo?" perde o assunto, "e se for interino?"
 * perde o instituto. O que ia para o `match_chunks_*` era literalmente "e o prazo?" — uma
 * consulta que não casa com nada, ou pior, casa com o trecho errado com a mesma
 * confiança da consulta certa.
 *
 * Módulo puro de propósito: a decisão de QUANDO confiar na reescrita do modelo é a parte
 * que precisa de teste, e ela não pode depender de credencial para rodar.
 */

import type { BaseMessage } from "@langchain/core/messages"
import { messageText } from "../lib/message-text.ts"

/**
 * Mensagens de histórico enviadas ao pré-passe.
 *
 * Seis é o suficiente para resolver referência ("o prazo DISSO"), e o teto existe porque
 * o histórico inteiro de uma conversa longa custaria mais que a busca que ele qualifica.
 */
export const HISTORY_MESSAGE_LIMIT = 6

/** Corte por mensagem. A resposta do ATLAS é longa e citada; o que importa é o assunto. */
export const HISTORY_MESSAGE_CHARS = 400

/**
 * Teto da consulta reescrita. Acima disso o modelo não resolveu referência — ele resumiu a
 * conversa, e um resumo é a pior consulta possível para uma busca que conjunta termos.
 */
export const MAX_SEARCH_QUERY_CHARS = 300

function condense(content: unknown): string {
	const text = messageText(content).replace(/\s+/g, " ").trim()
	return text.length > HISTORY_MESSAGE_CHARS ? `${text.slice(0, HISTORY_MESSAGE_CHARS)}…` : text
}

/**
 * O histórico ANTES da pergunta atual, já rotulado por quem falou.
 *
 * A última mensagem é a pergunta em curso e fica de fora: ela vai separada, para o modelo
 * saber o que reescrever. String vazia quando é o primeiro turno.
 */
export function formatHistory(messages: BaseMessage[]): string {
	return messages
		.slice(0, -1)
		.filter((message) => message.getType() === "human" || message.getType() === "ai")
		.slice(-HISTORY_MESSAGE_LIMIT)
		.map((message) => `${message.getType() === "human" ? "Usuário" : "ATLAS"}: ${condense(message.content)}`)
		.filter((line) => !line.endsWith(": "))
		.join("\n")
}

/**
 * A consulta que vai à busca — a reescrita do modelo, ou a pergunta crua.
 *
 * A pergunta crua é o piso, e ele vale sempre que a reescrita não for claramente melhor:
 *
 * - **Sem histórico não há o que resolver.** Deixar o modelo "melhorar" a primeira
 *   pergunta seria trocar o que o usuário escreveu por uma paráfrase, e é justamente numa
 *   pergunta de sigla — a que este fluxo existe para consertar — que a paráfrase pode
 *   perder o termo que casa com a norma.
 * - **Reescrita vazia** é o modelo não tendo entendido a tarefa.
 * - **Reescrita longa demais** é resumo de conversa, não consulta.
 */
export function resolveSearchQuery(declared: string | null | undefined, rawQuery: string, hasHistory: boolean): string {
	if (!hasHistory) return rawQuery

	// Aspas em volta são o vício mais comum de quem pede "devolva APENAS a consulta", e
	// entrariam como termo na busca textual.
	const rewritten = (declared ?? "")
		.trim()
		.replace(/^["'“”]+|["'“”]+$/g, "")
		.trim()
	if (!rewritten || rewritten.length > MAX_SEARCH_QUERY_CHARS) return rawQuery

	return rewritten
}
