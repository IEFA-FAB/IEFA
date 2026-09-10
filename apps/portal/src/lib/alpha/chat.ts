/**
 * @module alpha/chat
 * Conversa do ChatRADA contra a API do Projeto α.
 *
 * A tela do ChatRADA foi escrita contra um contrato que o α não tem mais: ela chamava
 * `POST /ask` e `GET /sessions` com o identificador do usuário num header `X-User-Id`.
 * Hoje o α expõe `/api/v1/sessions*`, autentica por **Bearer** (JWT do Supabase, validado
 * a cada request) e responde SSE com eventos NOMEADOS. Os caminhos antigos devolvem 404, e
 * a página ficava presa em "verificando conexão".
 *
 * A sessão é só um UUID que o cliente cunha e que o α reconhece pelo `query_log` — não há
 * tabela de sessão. A listagem (`GET /api/v1/sessions`) foi acrescentada ao α para esta
 * tela; APAGAR uma sessão continua sem servidor, e por isso não está aqui: a conversa vive
 * também no checkpointer do LangGraph, e um endpoint que removesse só o log declararia uma
 * exclusão que não aconteceu.
 */

import { ALPHA_BASE_URL, alphaRequest } from "./client"

/** Resposta do α a uma pergunta — `buildResponse` do lado de lá. */
export interface ChatAnswer {
	session_id: string
	/** Texto da resposta. Vazio quando o grafo terminou sem base normativa. */
	final_response?: string
	/** Ids de chunk citados; resolvíveis por `/api/v1/chunks/:id`. */
	cited_documents: string[]
	/** `success`, `no_documents_found`, `hallucination_detected`… */
	termination_reason?: string
	intent?: string
	retrieval_iterations?: number
}

interface SessionCreated {
	session_id: string
}

interface MessagesList {
	session_id: string
	messages: Array<{ role: string; content: string; cited_documents?: string[] }>
}

/**
 * Um trecho citado, como o α o guarda.
 *
 * `metadata.source` é o rótulo do documento ("RADA-e Módulo C"); `chapter` e `article` são
 * o dispositivo. É com isso que a citação deixa de ser um UUID e vira uma referência que
 * alguém consegue conferir.
 */
export interface ChunkDetail {
	id: string
	content: string
	chapter: string | null
	article: string | null
	section: string | null
	chunk_index: number
	metadata: { source?: string; document_type?: string; year?: number } | null
}

export async function fetchChunk(token: string, chunkId: string): Promise<ChunkDetail> {
	return await alphaRequest<ChunkDetail>(`/api/v1/chunks/${chunkId}`, token)
}

/** Rótulo curto do trecho: documento e dispositivo, quando houver. */
export function chunkLabel(chunk: ChunkDetail): string {
	const dispositivo = [chunk.chapter, chunk.article].filter(Boolean).join(", ")
	const documento = chunk.metadata?.source?.trim() || "Trecho do RADA-e"
	return dispositivo ? `${documento} — ${dispositivo}` : documento
}

/** Uma conversa anterior, como o α a deriva do `query_log`. */
export interface ChatSessionSummary {
	session_id: string
	title: string
	last_message_at: string
	messages: number
}

export async function listChatSessions(token: string): Promise<ChatSessionSummary[]> {
	const data = await alphaRequest<{ sessions: ChatSessionSummary[] }>("/api/v1/sessions", token)
	return data.sessions
}

export async function createChatSession(token: string): Promise<string> {
	const created = await alphaRequest<SessionCreated>("/api/v1/sessions", token, { method: "POST" })
	return created.session_id
}

export async function fetchSessionMessages(token: string, sessionId: string): Promise<MessagesList["messages"]> {
	const data = await alphaRequest<MessagesList>(`/api/v1/sessions/${sessionId}/messages`, token)
	return data.messages
}

export async function sendMessage(token: string, sessionId: string, message: string): Promise<ChatAnswer> {
	return await alphaRequest<ChatAnswer>(`/api/v1/sessions/${sessionId}/messages`, token, {
		method: "POST",
		body: JSON.stringify({ message }),
	})
}

/**
 * Abre o stream de uma pergunta.
 *
 * Devolve a `Response` crua porque o corpo é consumido incrementalmente — `alphaRequest`
 * faz `.json()` e serviria só depois do fim, que é justamente o que o stream evita.
 */
export async function openMessageStream(token: string, sessionId: string, message: string, signal?: AbortSignal): Promise<Response> {
	const response = await fetch(`${ALPHA_BASE_URL}/api/v1/sessions/${sessionId}/messages/stream`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${token}` },
		body: JSON.stringify({ message }),
		signal,
	})

	if (!response.ok || !response.body) {
		throw new Error(await response.text().catch(() => `stream: ${response.status}`))
	}
	return response
}

/** Um evento SSE já separado em nome e dado. */
export interface SseEvent {
	event: string
	data: string
}

/**
 * Separa eventos SSE completos do buffer, devolvendo o resto.
 *
 * O nome do evento importa: o α manda `status` a cada nó do grafo e `complete` no fim. A
 * versão anterior lia apenas as linhas `data:` e ignorava `event:`, então tratava o
 * `complete` como um `status` qualquer — a resposta nunca aparecia na tela.
 *
 * Puro de propósito: é a parte que erra e a que dá para testar sem rede.
 */
export function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
	const parts = buffer.split("\n\n")
	const rest = parts.pop() ?? ""
	const events: SseEvent[] = []

	for (const block of parts) {
		let event = "message"
		const dataLines: string[] = []

		for (const rawLine of block.split("\n")) {
			const line = rawLine.trimEnd()
			if (line.startsWith(":")) continue // comentário/keep-alive
			if (line.startsWith("event:")) event = line.slice(6).trim()
			else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""))
		}

		if (dataLines.length > 0) events.push({ event, data: dataLines.join("\n") })
	}

	return { events, rest }
}

/** Mensagem para o usuário quando o grafo termina sem produzir resposta. */
export function answerText(answer: ChatAnswer): string {
	if (answer.final_response?.trim()) return answer.final_response
	return "Não foi possível produzir uma resposta com base na legislação disponível."
}
