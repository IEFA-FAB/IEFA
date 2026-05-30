import type { UIMessage } from "@tanstack/ai-client"
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useChatMessages, useCreateChatSession, useSaveChatMessage, useUpdateMessageChartType } from "@/hooks/data/useAnalyticsChatHistory"
import type { ChartSpec, ChartType, ChatMessage } from "@/types/domain/analytics-chat"

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

function extractChart(parts: UIMessage["parts"]): ChartSpec | undefined {
	// biome-ignore lint/suspicious/noExplicitAny: UIMessage part union requires cast to access tool-call name
	const part = parts.find((p) => p.type === "tool-call" && (p as any).name === "render_chart")
	if (part?.type !== "tool-call") return undefined
	const out = part.output
	if (!out || typeof out !== "object" || "error" in out) return undefined
	return out as ChartSpec
}

function hasMessagePayload(content: string, chart?: ChartSpec, error?: string): boolean {
	return content.trim().length > 0 || chart !== undefined || Boolean(error?.trim())
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface UseChatSessionOptions {
	sessionId: string | undefined
	onSessionCreated: (id: string) => void
}

export interface UseChatSessionReturn {
	messages: ChatMessage[]
	isStreaming: boolean
	loadingMessages: boolean
	handleSubmit: (message: string) => void
	handleAbort: () => void
	handleChartTypeChange: (messageId: string, type: ChartType) => void
}

// ── Connection ────────────────────────────────────────────────────────────────

// Stable reference — must not change between renders or useChat recreates the client.
const STREAM_CONNECTION = fetchServerSentEvents("/api/analytics/stream")

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChatSession({ sessionId, onSessionCreated }: UseChatSessionOptions): UseChatSessionReturn {
	// Refs for session management (never cause re-renders)
	const sessionIdRef = useRef<string | undefined>(sessionId)
	const sessionPromiseRef = useRef<Promise<string> | null>(null)
	const pendingChartOverridesRef = useRef<Map<string, ChartType>>(new Map())

	useEffect(() => {
		sessionIdRef.current = sessionId
	}, [sessionId])

	// ── Persistence hooks ─────────────────────────────────────────────────────

	const { data: loadedMessages, isLoading: loadingMessages } = useChatMessages(sessionId)
	const createSession = useCreateChatSession()
	const saveMessage = useSaveChatMessage()
	const updateChartType = useUpdateMessageChartType()

	// Stable refs so callbacks never capture stale mutations
	const saveMessageRef = useRef(saveMessage)
	const createSessionRef = useRef(createSession)
	const updateChartTypeRef = useRef(updateChartType)
	const onSessionCreatedRef = useRef(onSessionCreated)
	useEffect(() => {
		saveMessageRef.current = saveMessage
	})
	useEffect(() => {
		createSessionRef.current = createSession
	})
	useEffect(() => {
		updateChartTypeRef.current = updateChartType
	})
	useEffect(() => {
		onSessionCreatedRef.current = onSessionCreated
	})

	// ── Chart state ───────────────────────────────────────────────────────────

	// Charts loaded from DB (message ID → ChartSpec).
	// Merged with in-flight ToolCallPart.output when mapping UIMessage → ChatMessage.
	const [chartDataMap, setChartDataMap] = useState<Map<string, ChartSpec>>(new Map())
	const chartDataMapRef = useRef(chartDataMap)
	useEffect(() => {
		chartDataMapRef.current = chartDataMap
	}, [chartDataMap])

	// User-selected chart type overrides (message ID → ChartType)
	const [chartTypeOverrides, setChartTypeOverrides] = useState<Map<string, ChartType>>(new Map())

	// ── useChat ───────────────────────────────────────────────────────────────

	const onFinish = useCallback((msg: UIMessage) => {
		if (msg.role !== "assistant") return
		const content = extractText(msg.parts)
		const chart = extractChart(msg.parts)
		if (!hasMessagePayload(content, chart)) return

		// Store chart so the DB sync effect can retrieve it by message ID
		if (chart) {
			setChartDataMap((prev) => new Map(prev).set(msg.id, chart))
		}

		// Persist assistant message. Await the session promise in case it is still
		// pending (first message of a new session creates the session concurrently).
		void sessionPromiseRef.current
			?.then(async (sid) => {
				const doSave = async (attempt = 0): Promise<void> => {
					try {
						await saveMessageRef.current.mutateAsync({
							sessionId: sid,
							role: "assistant",
							content,
							chart,
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

	const {
		messages: uiMessages,
		sendMessage,
		stop,
		isLoading,
		setMessages,
	} = useChat({
		connection: STREAM_CONNECTION,
		onFinish,
	})

	// Keep a ref to uiMessages so effects can read the current value without
	// adding uiMessages to their dependency arrays (which would cause loops).
	const uiMessagesRef = useRef<UIMessage[]>([])
	uiMessagesRef.current = uiMessages

	// ── DB sync effect ────────────────────────────────────────────────────────

	// Syncs persisted messages from DB into the useChat state.
	// Skips while streaming (isLoading) or while in-memory has more messages than DB.
	//
	// Positional mapping (prev[i] → loaded[i]) handles the temp-ID → DB-UUID
	// transition: useChat generates random IDs; the DB assigns real UUIDs on save.
	// Any pending chart-type overrides selected on temp IDs are flushed here.
	useEffect(() => {
		if (!sessionId) {
			setMessages([])
			setChartDataMap(new Map())
			setChartTypeOverrides(new Map())
			pendingChartOverridesRef.current.clear()
			return
		}
		if (!loadedMessages) return
		if (isLoading) return
		const prev = uiMessagesRef.current
		if (prev.length > 0 && prev.length > loadedMessages.length) return

		// Build UIMessage array from DB rows (text content only; chart kept in chartDataMap)
		const newMessages: UIMessage[] = loadedMessages.map((m) => ({
			id: m.id,
			role: m.role as "user" | "assistant",
			parts: [{ type: "text" as const, content: m.content }],
			createdAt: new Date(m.created_at),
		}))

		// Flush pending chart-type overrides: user selected a type between stream end
		// and this sync. Now we have real UUIDs — persist the selection to DB.
		if (pendingChartOverridesRef.current.size > 0) {
			const sid = sessionIdRef.current
			for (const [tempId, pendingType] of pendingChartOverridesRef.current) {
				const oldIdx = prev.findIndex((m) => m.id === tempId)
				const target = oldIdx !== -1 ? newMessages[oldIdx] : undefined
				if (target && target.role === "assistant") {
					setChartTypeOverrides((prev) => new Map(prev).set(target.id, pendingType))
					if (sid) {
						updateChartTypeRef.current.mutate({
							messageId: target.id,
							sessionId: sid,
							chartTypeOverride: pendingType,
						})
					}
				}
			}
			pendingChartOverridesRef.current.clear()
		}

		setMessages(newMessages)

		// Restore chart type overrides from DB
		const dbOverrides = new Map<string, ChartType>()
		for (const m of loadedMessages) {
			if (m.chart_type_override) dbOverrides.set(m.id, m.chart_type_override as ChartType)
		}
		setChartTypeOverrides(dbOverrides)

		// Populate chart data map from DB rows
		const dbCharts = new Map<string, ChartSpec>()
		for (const m of loadedMessages) {
			if (m.chart) dbCharts.set(m.id, m.chart as unknown as ChartSpec)
		}
		setChartDataMap(dbCharts)
	}, [sessionId, loadedMessages, isLoading, setMessages])

	// ── Derived messages ──────────────────────────────────────────────────────

	const lastAssistantIdx = uiMessages.reduce((last, m, i) => (m.role === "assistant" ? i : last), -1)

	const messages: ChatMessage[] = uiMessages
		.filter((m) => m.role === "user" || m.role === "assistant")
		.map((m, i) => ({
			id: m.id,
			role: m.role as "user" | "assistant",
			content: extractText(m.parts),
			chart: extractChart(m.parts) ?? chartDataMapRef.current.get(m.id),
			chartTypeOverride: chartTypeOverrides.get(m.id),
			isStreaming: isLoading && i === lastAssistantIdx && m.role === "assistant",
			createdAt: m.createdAt ?? new Date(),
		}))
		.filter((m) => m.role === "user" || m.isStreaming || hasMessagePayload(m.content, m.chart))

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

	const handleChartTypeChange = useCallback((messageId: string, type: ChartType) => {
		const sid = sessionIdRef.current
		if (!sid) return

		setChartTypeOverrides((prev) => new Map(prev).set(messageId, type))

		const isDbUuid = messageId.length === 36 && messageId[8] === "-"
		if (isDbUuid) {
			updateChartTypeRef.current.mutate({ messageId, sessionId: sid, chartTypeOverride: type })
		} else {
			pendingChartOverridesRef.current.set(messageId, type)
		}
	}, [])

	return {
		messages,
		isStreaming: isLoading,
		loadingMessages,
		handleSubmit,
		handleAbort,
		handleChartTypeChange,
	}
}
