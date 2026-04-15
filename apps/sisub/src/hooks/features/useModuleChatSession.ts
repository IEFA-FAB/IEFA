import { useCallback, useEffect, useRef, useState } from "react"
import { useCreateModuleChatSession, useModuleChatMessages, useSaveModuleChatMessage } from "@/hooks/data/useModuleChatHistory"
import { useModuleChatStream } from "@/lib/module-chat/stream"
import type { ChatModule, ModuleChatMessage, ModuleStreamEvent, ToolCall } from "@/types/domain/module-chat"

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateId() {
	return Math.random().toString(36).slice(2, 10)
}

function titleFromMessage(msg: string) {
	const trimmed = msg.replace(/\s+/g, " ").trim()
	return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed
}

// ── Types ───────────────────────────────────────────────────────────────────

interface UseModuleChatSessionOptions {
	sessionId: string | undefined
	module: ChatModule
	scopeId?: number
	onSessionCreated: (id: string) => void
}

export interface UseModuleChatSessionReturn {
	messages: ModuleChatMessage[]
	isStreaming: boolean
	loadingMessages: boolean
	handleSubmit: (message: string) => void
	handleAbort: () => void
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Manages the full module chat session lifecycle:
 * - message state (in-memory + DB sync)
 * - session creation on first message
 * - streaming coordination (SSE)
 * - tool call accumulation
 * - persistence with exponential-backoff retry
 */
export function useModuleChatSession({ sessionId, module, scopeId, onSessionCreated }: UseModuleChatSessionOptions): UseModuleChatSessionReturn {
	const [messages, setMessages] = useState<ModuleChatMessage[]>([])

	const messagesRef = useRef<ModuleChatMessage[]>([])
	const pendingAssistantId = useRef<string | null>(null)
	const sessionIdRef = useRef<string | undefined>(sessionId)
	const sessionPromiseRef = useRef<Promise<string> | null>(null)

	useEffect(() => {
		messagesRef.current = messages
	}, [messages])
	useEffect(() => {
		sessionIdRef.current = sessionId
	}, [sessionId])

	// ── Persistence hooks ─────────────────────────────────────────────────────

	const { data: loadedMessages, isLoading: loadingMessages } = useModuleChatMessages(sessionId)
	const createSession = useCreateModuleChatSession(module, scopeId)
	const saveMessage = useSaveModuleChatMessage(module, scopeId)

	// Sync persisted messages from DB into state
	useEffect(() => {
		if (!sessionId) {
			setMessages([])
			return
		}
		if (!loadedMessages) return
		if (pendingAssistantId.current) return
		if (messagesRef.current.length > 0 && messagesRef.current.length > loadedMessages.length) return

		const mapped: ModuleChatMessage[] = loadedMessages.map((m) => ({
			id: m.id,
			role: m.role as "user" | "assistant" | "tool",
			content: m.content,
			toolCalls: m.tool_calls ? (m.tool_calls as unknown as ToolCall[]) : undefined,
			toolCallId: m.tool_call_id ?? undefined,
			toolName: m.tool_name ?? undefined,
			toolResult: m.tool_result ?? undefined,
			error: m.error ?? undefined,
			createdAt: new Date(m.created_at),
		}))

		setMessages(mapped)
	}, [sessionId, loadedMessages])

	// ── Streaming ─────────────────────────────────────────────────────────────

	const { submit, abort, isStreaming } = useModuleChatStream(
		useCallback(
			(event: ModuleStreamEvent) => {
				const id = pendingAssistantId.current
				if (!id) return

				setMessages((prev) => {
					const idx = prev.findIndex((m) => m.id === id)
					if (idx === -1) return prev
					const msg = { ...prev[idx] }

					if (event.type === "text_delta") {
						msg.content = (msg.content ?? "") + event.delta
					} else if (event.type === "tool_call_start") {
						const tc: ToolCall = { id: event.id, name: event.name, arguments: "", status: "calling" }
						msg.toolCalls = [...(msg.toolCalls ?? []), tc]
					} else if (event.type === "tool_call_done") {
						msg.toolCalls = (msg.toolCalls ?? []).map((tc) =>
							tc.id === event.id ? { ...tc, arguments: JSON.stringify(event.arguments), status: "calling" as const } : tc
						)
					} else if (event.type === "tool_result") {
						msg.toolCalls = (msg.toolCalls ?? []).map((tc) =>
							tc.id === event.id ? { ...tc, status: event.isError ? ("error" as const) : ("done" as const), result: event.result, isError: event.isError } : tc
						)
					} else if (event.type === "done") {
						msg.isStreaming = false
					} else if (event.type === "error") {
						msg.error = event.message
						msg.isStreaming = false
					}

					const updated = [...prev]
					updated[idx] = msg
					messagesRef.current = updated
					return updated
				})

				// Persist on completion
				if (event.type === "done" || event.type === "error") {
					pendingAssistantId.current = null

					const latest = messagesRef.current.find((m) => m.id === id)
					if (!latest || !sessionPromiseRef.current) return

					void sessionPromiseRef.current
						.then(async (sid) => {
							const doSave = async (attempt = 0): Promise<void> => {
								try {
									await saveMessage.mutateAsync({
										sessionId: sid,
										role: "assistant",
										content: latest.content,
										toolCalls: latest.toolCalls,
										error: latest.error,
									})
								} catch (_err) {
									if (attempt < 3) {
										await new Promise<void>((r) => setTimeout(r, 1000 * 2 ** attempt))
										return doSave(attempt + 1)
									}
								}
							}
							await doSave()
						})
						.catch((_err: unknown) => {})
				}
			},
			[saveMessage]
		),
		{ module, scopeId }
	)

	// ── Action handlers ───────────────────────────────────────────────────────

	const handleAbort = useCallback(() => {
		abort()
		const id = pendingAssistantId.current
		if (!id) return
		pendingAssistantId.current = null
		setMessages((prev) =>
			prev.map((m) =>
				m.id === id
					? {
							...m,
							isStreaming: false,
							error: m.content || m.error ? m.error : "Geração interrompida.",
						}
					: m
			)
		)
	}, [abort])

	const handleSubmit = useCallback(
		(message: string) => {
			const history = messagesRef.current.filter((e) => !e.isStreaming)

			const userMsg: ModuleChatMessage = {
				id: generateId(),
				role: "user",
				content: message,
				createdAt: new Date(),
			}
			const assistantId = generateId()
			pendingAssistantId.current = assistantId
			const assistantMsg: ModuleChatMessage = {
				id: assistantId,
				role: "assistant",
				content: "",
				isStreaming: true,
				createdAt: new Date(),
			}
			setMessages((prev) => [...prev, userMsg, assistantMsg])

			void submit(message, history)

			const sid = sessionIdRef.current
			if (sid) {
				sessionPromiseRef.current = Promise.resolve(sid)
				saveMessage.mutate({ sessionId: sid, role: "user", content: message })
			} else {
				const p = createSession.mutateAsync(titleFromMessage(message)).then((newSession) => {
					sessionIdRef.current = newSession.id
					onSessionCreated(newSession.id)
					saveMessage.mutate({ sessionId: newSession.id, role: "user", content: message })
					return newSession.id
				})
				sessionPromiseRef.current = p
			}
		},
		[submit, createSession, saveMessage, onSessionCreated]
	)

	return {
		messages,
		isStreaming,
		loadingMessages,
		handleSubmit,
		handleAbort,
	}
}
