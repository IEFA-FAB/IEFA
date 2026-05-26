import type { UIMessage } from "@tanstack/ai-client"
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useCreateModuleChatSession, useModuleChatMessages, useSaveModuleChatMessage } from "@/hooks/data/useModuleChatHistory"
import type { ChatModule, ModuleChatMessage, ToolCall } from "@/types/domain/module-chat"

// ── Helpers ───────────────────────────────────────────────────────────────────

function titleFromMessage(msg: string) {
	const trimmed = msg.replace(/\s+/g, " ").trim()
	return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed
}

function extractText(parts: UIMessage["parts"]): string {
	return parts
		.filter((p): p is { type: "text"; content: string } => p.type === "text")
		.map((p) => p.content)
		.join("")
}

function extractToolCalls(parts: UIMessage["parts"]): ToolCall[] {
	return parts
		.filter((p) => p.type === "tool-call")
		.map((p) => {
			// biome-ignore lint/suspicious/noExplicitAny: UIMessage part union requires cast to access tool-call fields
			const tc = p as any
			const hasOutput = tc.output !== undefined && tc.output !== null
			const hasError = hasOutput && typeof tc.output === "object" && "error" in tc.output
			return {
				id: tc.id as string,
				name: tc.name as string,
				arguments: tc.arguments as string,
				status: (hasOutput ? (hasError ? "error" : "done") : "calling") as ToolCall["status"],
				result: hasOutput ? (hasError ? undefined : tc.output) : undefined,
				isError: hasError,
			} satisfies ToolCall
		})
}

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Connection ────────────────────────────────────────────────────────────────

const MODULE_STREAM_URL = "/api/module-chat/stream"

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useModuleChatSession({ sessionId, module, scopeId, onSessionCreated }: UseModuleChatSessionOptions): UseModuleChatSessionReturn {
	// Refs for session management
	const sessionIdRef = useRef<string | undefined>(sessionId)
	const sessionPromiseRef = useRef<Promise<string> | null>(null)

	useEffect(() => {
		sessionIdRef.current = sessionId
	}, [sessionId])

	// ── Persistence hooks ─────────────────────────────────────────────────────

	const { data: loadedMessages, isLoading: loadingMessages } = useModuleChatMessages(sessionId)
	const createSession = useCreateModuleChatSession(module, scopeId)
	const saveMessage = useSaveModuleChatMessage(module, scopeId)

	const saveMessageRef = useRef(saveMessage)
	const createSessionRef = useRef(createSession)
	const onSessionCreatedRef = useRef(onSessionCreated)
	useEffect(() => {
		saveMessageRef.current = saveMessage
	})
	useEffect(() => {
		createSessionRef.current = createSession
	})
	useEffect(() => {
		onSessionCreatedRef.current = onSessionCreated
	})

	// ── Tool calls map (display data from DB load + completed streams) ─────────

	const [toolCallsMap, setToolCallsMap] = useState<Map<string, ToolCall[]>>(new Map())
	const toolCallsMapRef = useRef(toolCallsMap)
	useEffect(() => {
		toolCallsMapRef.current = toolCallsMap
	}, [toolCallsMap])

	// ── onFinish ──────────────────────────────────────────────────────────────

	const onFinish = useCallback((msg: UIMessage) => {
		if (msg.role !== "assistant") return
		const content = extractText(msg.parts)
		const toolCalls = extractToolCalls(msg.parts)

		if (toolCalls.length > 0) {
			setToolCallsMap((prev) => new Map(prev).set(msg.id, toolCalls))
		}

		void sessionPromiseRef.current
			?.then(async (sid) => {
				const doSave = async (attempt = 0): Promise<void> => {
					try {
						await saveMessageRef.current.mutateAsync({
							sessionId: sid,
							role: "assistant",
							content,
							toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
						})
					} catch {
						if (attempt < 3) {
							await new Promise<void>((r) => setTimeout(r, 1000 * 2 ** attempt))
							return doSave(attempt + 1)
						}
					}
				}
				await doSave()
			})
			.catch((_err: unknown) => {})
	}, [])

	// ── useChat ───────────────────────────────────────────────────────────────

	// module/scopeId go in body → forwarded as forwardedProps on the server
	const connection = fetchServerSentEvents(MODULE_STREAM_URL)
	const {
		messages: uiMessages,
		sendMessage,
		stop,
		isLoading,
		setMessages,
	} = useChat({
		connection,
		body: { module, scopeId },
		onFinish,
	})

	const uiMessagesRef = useRef<UIMessage[]>([])
	uiMessagesRef.current = uiMessages

	// ── DB sync effect ────────────────────────────────────────────────────────

	useEffect(() => {
		if (!sessionId) {
			setMessages([])
			setToolCallsMap(new Map())
			return
		}
		if (!loadedMessages) return
		if (isLoading) return
		const prev = uiMessagesRef.current
		if (prev.length > 0 && prev.length > loadedMessages.length) return

		const newMessages: UIMessage[] = loadedMessages
			.filter((m) => m.role === "user" || m.role === "assistant")
			.map((m) => ({
				id: m.id,
				role: m.role as "user" | "assistant",
				parts: [{ type: "text" as const, content: m.content }],
				createdAt: new Date(m.created_at),
			}))

		setMessages(newMessages)

		// Restore tool calls from DB
		const dbToolCalls = new Map<string, ToolCall[]>()
		for (const m of loadedMessages) {
			if (m.tool_calls) {
				dbToolCalls.set(m.id, m.tool_calls as unknown as ToolCall[])
			}
		}
		setToolCallsMap(dbToolCalls)
	}, [sessionId, loadedMessages, isLoading, setMessages])

	// ── Derived messages ──────────────────────────────────────────────────────

	const lastAssistantIdx = uiMessages.reduce((last, m, i) => (m.role === "assistant" ? i : last), -1)

	const messages: ModuleChatMessage[] = uiMessages
		.filter((m) => m.role === "user" || m.role === "assistant")
		.map((m, i) => {
			const streamingToolCalls = extractToolCalls(m.parts)
			const storedToolCalls = toolCallsMapRef.current.get(m.id)
			return {
				id: m.id,
				role: m.role as "user" | "assistant",
				content: extractText(m.parts),
				toolCalls: streamingToolCalls.length > 0 ? streamingToolCalls : storedToolCalls,
				isStreaming: isLoading && i === lastAssistantIdx && m.role === "assistant",
				createdAt: m.createdAt ?? new Date(),
			}
		})

	// ── Action handlers ───────────────────────────────────────────────────────

	const handleAbort = useCallback(() => {
		stop()
	}, [stop])

	const handleSubmit = useCallback(
		(message: string) => {
			const sid = sessionIdRef.current
			if (sid) {
				sessionPromiseRef.current = Promise.resolve(sid)
				saveMessageRef.current.mutate({ sessionId: sid, role: "user", content: message })
			} else {
				const p = createSessionRef.current.mutateAsync(titleFromMessage(message)).then((newSession) => {
					sessionIdRef.current = newSession.id
					onSessionCreatedRef.current(newSession.id)
					saveMessageRef.current.mutate({ sessionId: newSession.id, role: "user", content: message })
					return newSession.id
				})
				sessionPromiseRef.current = p
			}
			void sendMessage(message)
		},
		[sendMessage]
	)

	return {
		messages,
		isStreaming: isLoading,
		loadingMessages,
		handleSubmit,
		handleAbort,
	}
}
