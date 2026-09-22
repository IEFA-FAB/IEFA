/**
 * Chat sobre documento — cliente do contrate para `/api/v1/chats` do α.
 *
 * Duas espécies de conversa: a do PROCESSO (painel na tela do processo) e a AVULSA
 * (`/conversar`, com anexos). A conversa é de quem a abriu; o α responde 404 a qualquer outro.
 *
 * O turno é SSE: o texto chega aos pedaços (`delta`) e o `complete` traz o texto FINAL, já com
 * as citações conferidas no servidor — o que a tela mostra no fim é sempre o do `complete`,
 * nunca a soma dos pedaços, porque o α tira do texto o rótulo que não tem fonte.
 */

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import {
	type ChatAttachment,
	type ChatKind,
	type ChatPhase,
	type ChatThread,
	type ChatThreadDetail,
	ChatTurnError,
	type ChunkDetail,
	type Citation,
} from "./chat-model"
import { ALPHA_BASE_URL, alphaPath, alphaRequest } from "./client"
import { parseSseBuffer } from "./sse"

// ─── Leitura ──────────────────────────────────────────────────────────────────

export const chatKeys = {
	all: ["alpha", "chats"] as const,
	list: (filter: { submissionId?: string; kind?: ChatKind }) => ["alpha", "chats", "list", filter] as const,
	thread: (threadId: string) => ["alpha", "chats", "thread", threadId] as const,
}

export function chatListQueryOptions(token: string | undefined, filter: { submissionId?: string; kind?: ChatKind }) {
	const query = filter.submissionId ? alphaPath`?submission_id=${filter.submissionId}` : filter.kind ? alphaPath`?kind=${filter.kind}` : ""
	return queryOptions({
		queryKey: chatKeys.list(filter),
		queryFn: async () => (await alphaRequest<{ items: ChatThread[]; truncated: boolean }>(`/api/v1/chats${query}`, token)).items,
		enabled: Boolean(token),
	})
}

export function chatThreadQueryOptions(token: string | undefined, threadId: string) {
	return queryOptions({
		queryKey: chatKeys.thread(threadId),
		queryFn: () => alphaRequest<ChatThreadDetail>(alphaPath`/api/v1/chats/${threadId}`, token),
		enabled: Boolean(token),
	})
}

// ─── Escrita ──────────────────────────────────────────────────────────────────

export function useCreateChat() {
	const { session } = useAuth()
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: { submissionId?: string }) =>
			alphaRequest<ChatThread>("/api/v1/chats", session?.access_token, {
				method: "POST",
				body: JSON.stringify(input.submissionId ? { submission_id: input.submissionId } : {}),
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: chatKeys.all }),
	})
}

export function useUpdateChat() {
	const { session } = useAuth()
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: { threadId: string; saved?: boolean; title?: string }) =>
			alphaRequest<ChatThread>(alphaPath`/api/v1/chats/${input.threadId}`, session?.access_token, {
				method: "PATCH",
				body: JSON.stringify({ saved: input.saved, title: input.title }),
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: chatKeys.all }),
	})
}

export function useDeleteChat() {
	const { session } = useAuth()
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (threadId: string) => alphaRequest<void>(alphaPath`/api/v1/chats/${threadId}`, session?.access_token, { method: "DELETE" }),
		onSuccess: (_result, threadId) => {
			queryClient.removeQueries({ queryKey: chatKeys.thread(threadId) })
			queryClient.invalidateQueries({ queryKey: chatKeys.all })
		},
	})
}

export function useUploadAttachment() {
	const { session } = useAuth()
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: { threadId: string; file: File }) => {
			const form = new FormData()
			form.append("file", input.file)
			return alphaRequest<ChatAttachment>(alphaPath`/api/v1/chats/${input.threadId}/attachments`, session?.access_token, { method: "POST", body: form })
		},
		onSettled: (_result, _error, input) => queryClient.invalidateQueries({ queryKey: chatKeys.thread(input.threadId) }),
	})
}

export function useDeleteAttachment() {
	const { session } = useAuth()
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: { threadId: string; attachmentId: string }) =>
			alphaRequest<void>(alphaPath`/api/v1/chats/${input.threadId}/attachments/${input.attachmentId}`, session?.access_token, { method: "DELETE" }),
		onSettled: (_result, _error, input) => queryClient.invalidateQueries({ queryKey: chatKeys.thread(input.threadId) }),
	})
}

// ─── Turno (SSE) ──────────────────────────────────────────────────────────────

export interface TurnComplete {
	message_id: string | null
	content: string
	citations: Citation[]
	dropped_citations: number
}

export interface TurnHandlers {
	onPhase: (phase: ChatPhase) => void
	onDelta: (text: string) => void
}

/**
 * Envia a pergunta e consome o SSE até o `complete`. Recusa ANTES do stream (403, 404, 429,
 * 502) vira {@link ChatTurnError} com o código do α; erro DEPOIS dele, pelo evento `error`.
 */
export async function streamTurn(
	token: string | undefined,
	threadId: string,
	message: string,
	handlers: TurnHandlers,
	signal: AbortSignal
): Promise<TurnComplete> {
	const response = await fetch(`${ALPHA_BASE_URL}${alphaPath`/api/v1/chats/${threadId}/messages/stream`}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
		body: JSON.stringify({ message }),
		signal,
	})

	if (!response.ok || !response.body) {
		const body = (await response.json().catch(() => null)) as { code?: string; message?: string; retry_after?: string } | null
		throw new ChatTurnError(body?.code ?? `HTTP_${response.status}`, body?.message ?? `falha ${response.status}`, body?.retry_after ?? null)
	}

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ""
	for (;;) {
		const { value, done } = await reader.read()
		if (done) break
		buffer += decoder.decode(value, { stream: true })
		const parsed = parseSseBuffer(buffer)
		buffer = parsed.rest
		for (const event of parsed.events) {
			const data = JSON.parse(event.data) as Record<string, unknown>
			if (event.event === "status") handlers.onPhase(data.phase as ChatPhase)
			else if (event.event === "delta") handlers.onDelta(String(data.text ?? ""))
			else if (event.event === "complete") return data as unknown as TurnComplete
			else if (event.event === "error") throw new ChatTurnError(String(data.code ?? "INTERNAL_ERROR"), "o turno falhou")
		}
	}
	// Stream que termina sem `complete` nem `error`: conexão cortada no meio (ALB, rede).
	throw new ChatTurnError("CONNECTION_LOST", "a conexão caiu antes do fim da resposta")
}

/** Trecho de norma citado, lido sob demanda ao abrir a citação. Imutável: não expira. */
export function chunkQueryOptions(token: string | undefined, chunkId: string) {
	return queryOptions({
		queryKey: ["alpha", "chunks", chunkId],
		queryFn: () => alphaRequest<ChunkDetail>(alphaPath`/api/v1/chunks/${chunkId}`, token),
		staleTime: Number.POSITIVE_INFINITY,
		enabled: Boolean(token),
	})
}
