import { useCallback, useEffect, useRef, useState } from "react"
import { useChatMessages, useCreateChatSession, useSaveChatMessage, useUpdateMessageChartType } from "@/hooks/data/useAnalyticsChatHistory"
import { useAnalyticsStream } from "@/lib/analytics-chat.stream"
import type { ChartType, ChatMessage, StreamEvent, StreamMeta } from "@/types/domain/analytics-chat"

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId() {
	return Math.random().toString(36).slice(2, 10)
}

function titleFromMessage(msg: string) {
	const trimmed = msg.replace(/\s+/g, " ").trim()
	return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed
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

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Manages the full chat session lifecycle:
 * - message state (in-memory + DB sync)
 * - session creation on first message
 * - streaming coordination (SSE)
 * - persistence with exponential-backoff retry
 * - chart type overrides
 *
 * ## What is persisted per assistant message
 * - `content`             → markdown text from the LLM
 * - `chart.sql`           → validated SQL that produced the chart data (required by stream endpoint)
 * - `chart.data`          → rows returned by the SQL (rendered directly, no re-query on load)
 * - `chart.type`          → LLM-suggested chart type (stored inside the JSONB blob)
 * - `chart_type_override` → user-selected override (separate column, null until user changes it)
 *
 * ## Chart type override lifecycle
 * 1. Stream ends → assistant message gets a client-generated 8-char temp ID.
 * 2. User may select a chart type before the DB sync runs → in-memory update applied
 *    immediately; temp ID stored in `pendingChartOverridesRef`.
 * 3. Save completes → DB sync effect runs, replacing temp IDs with real UUIDs.
 * 4. Sync effect flushes `pendingChartOverridesRef` via positional match (prev[i] → loaded[i]),
 *    merges the pending override into the mapped state, and persists it to DB.
 *
 * Scroll / virtualizer concerns intentionally stay in the UI layer.
 */
export function useChatSession({ sessionId, onSessionCreated }: UseChatSessionOptions): UseChatSessionReturn {
	const [messages, setMessages] = useState<ChatMessage[]>([])

	// Refs that never cause re-renders
	const messagesRef = useRef<ChatMessage[]>([])
	const pendingAssistantId = useRef<string | null>(null)
	const sessionIdRef = useRef<string | undefined>(sessionId)
	// Resolves to the active session ID once it is known (may be a pending creation).
	// The streaming save callback awaits this directly instead of polling.
	const sessionPromiseRef = useRef<Promise<string> | null>(null)
	// Tracks chart type overrides selected on messages that still have a temp ID
	// (between stream end and the DB sync that assigns real UUIDs).
	// Flushed and persisted inside the DB sync effect once the UUID is known.
	const pendingChartOverridesRef = useRef<Map<string, ChartType>>(new Map())
	const pendingMetaRef = useRef<StreamMeta | null>(null)

	// Keep refs in sync with React state / props
	useEffect(() => {
		messagesRef.current = messages
	}, [messages])
	useEffect(() => {
		sessionIdRef.current = sessionId
	}, [sessionId])

	// ── Persistence hooks ─────────────────────────────────────────────────────

	const { data: loadedMessages, isLoading: loadingMessages } = useChatMessages(sessionId)
	const createSession = useCreateChatSession()
	const saveMessage = useSaveChatMessage()
	const updateChartType = useUpdateMessageChartType()

	// Stable ref so the DB sync effect can call updateChartType.mutate without
	// adding the mutation object to its dependency array (prevents extra re-runs).
	const updateChartTypeRef = useRef(updateChartType)
	useEffect(() => {
		updateChartTypeRef.current = updateChartType
	})

	// Sync persisted messages from DB into state.
	// Skips while streaming (in-memory state is richer) or while a save is
	// in-flight (in-memory has messages the DB doesn't yet).
	//
	// Merge strategy:
	// - For messages with a stable UUID, prefer the DB override (already persisted)
	//   but fall back to the in-memory value so optimistic updates from
	//   updateChartType.onMutate are not wiped before the round-trip completes.
	// - For newly-saved messages (temp ID → real UUID, positional match), flush
	//   any pending chart-type override and persist it to the DB.
	useEffect(() => {
		if (!sessionId) {
			setMessages([])
			pendingChartOverridesRef.current.clear()
			return
		}
		if (!loadedMessages) return
		if (pendingAssistantId.current) return
		if (messagesRef.current.length > 0 && messagesRef.current.length > loadedMessages.length) return

		const prev = messagesRef.current

		const mapped: ChatMessage[] = loadedMessages.map((m, idx) => {
			// Exact-ID match: same message, may have an in-flight optimistic override.
			// Positional match: newly saved message whose temp ID just became a real UUID.
			const existing = prev.find((e) => e.id === m.id) ?? prev[idx]
			const dbOverride = (m.chart_type_override as ChartType | null) ?? undefined
			// DB value wins once persisted; fall back to in-memory for the brief window
			// where the optimistic update or a pending override hasn't reached the DB yet.
			const chartTypeOverride = dbOverride ?? existing?.chartTypeOverride

			return {
				id: m.id,
				role: m.role as "user" | "assistant",
				content: m.content,
				chart: (m.chart as unknown as ChatMessage["chart"]) ?? undefined,
				chartTypeOverride,
				error: m.error ?? undefined,
				createdAt: new Date(m.created_at),
			}
		})

		// Flush pending overrides: the user selected a chart type between stream end
		// and this sync. Now that we have real UUIDs we can persist the selection.
		if (pendingChartOverridesRef.current.size > 0) {
			const sid = sessionIdRef.current
			for (const [tempId, pendingType] of pendingChartOverridesRef.current) {
				const oldIdx = prev.findIndex((m) => m.id === tempId)
				const target = oldIdx !== -1 ? mapped[oldIdx] : undefined
				// Only apply if we found the positional match and the DB has no override yet.
				if (target && target.role === "assistant" && !target.chartTypeOverride) {
					mapped[oldIdx] = { ...target, chartTypeOverride: pendingType }
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

		setMessages(mapped)
	}, [sessionId, loadedMessages])

	// ── Streaming ─────────────────────────────────────────────────────────────

	const { submit, abort, isStreaming } = useAnalyticsStream(
		useCallback(
			(event: StreamEvent) => {
				const id = pendingAssistantId.current
				if (!id) return

				setMessages((prev) => {
					const idx = prev.findIndex((m) => m.id === id)
					if (idx === -1) return prev
					const msg = { ...prev[idx] }
					if (event.type === "text_delta") msg.content = (msg.content ?? "") + event.delta
					else if (event.type === "chart_spec") msg.chart = event.spec
					else if (event.type === "done") {
						msg.isStreaming = false
						pendingMetaRef.current = event.meta
					} else if (event.type === "error") {
						msg.error = event.message
						msg.isStreaming = false
						pendingMetaRef.current = event.meta
					}
					const updated = [...prev]
					updated[idx] = msg
					// Sync ref eagerly so the save callback sees the final accumulated state.
					messagesRef.current = updated
					return updated
				})

				// Persist assistant message on completion.
				//
				// Persisted fields:
				//   content  → full LLM markdown text
				//   chart    → complete ChartSpec: sql (validated query), data (SQL rows),
				//              type (LLM suggestion), title, series, xAxisKey
				//   error    → error message if generation failed
				//
				// chart_type_override is NOT included here — the user hasn't had a chance
				// to select one yet. It is persisted later via handleChartTypeChange →
				// updateMessageChartTypeFn (or via the DB sync flush for the rare case
				// where the user selects a type before the first DB sync completes).
				if (event.type === "done" || event.type === "error") {
					pendingAssistantId.current = null

					const latest = messagesRef.current.find((m) => m.id === id)
					if (!latest || !sessionPromiseRef.current) return

					// Capture meta before the async closure (ref may be overwritten)
					const meta = pendingMetaRef.current
					pendingMetaRef.current = null

					// Await session promise (already resolved if session existed,
					// pending if this is the first message of a new session).
					// Exponential-backoff retry: 1 s, 2 s, 4 s.
					void sessionPromiseRef.current
						.then(async (sid) => {
							const doSave = async (attempt = 0): Promise<void> => {
								try {
									await saveMessage.mutateAsync({
										sessionId: sid,
										role: "assistant",
										content: latest.content,
										chart: latest.chart,
										error: latest.error,
										model: meta?.model,
										latencyMs: meta?.latency_ms,
										inputTokens: meta?.input_tokens,
										outputTokens: meta?.output_tokens,
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
		)
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
							error: m.content || m.chart || m.error ? m.error : "Geração interrompida.",
						}
					: m
			)
		)
	}, [abort])

	const handleSubmit = useCallback(
		(message: string) => {
			const history = messagesRef.current.filter((e) => !e.isStreaming)

			const userMsg: ChatMessage = {
				id: generateId(),
				role: "user",
				content: message,
				createdAt: new Date(),
			}
			const assistantId = generateId()
			pendingAssistantId.current = assistantId
			const assistantMsg: ChatMessage = {
				id: assistantId,
				role: "assistant",
				content: "",
				isStreaming: true,
				createdAt: new Date(),
			}
			setMessages((prev) => [...prev, userMsg, assistantMsg])

			// Start streaming immediately — don't block on session creation
			void submit(message, history)

			// Wire up sessionPromiseRef so the save callback can await the session ID.
			const sid = sessionIdRef.current
			if (sid) {
				sessionPromiseRef.current = Promise.resolve(sid)
				saveMessage.mutate({ sessionId: sid, role: "user", content: message })
			} else {
				// First message — create session, then save user message
				const p = createSession.mutateAsync(titleFromMessage(message)).then((newSession) => {
					sessionIdRef.current = newSession.id
					onSessionCreated(newSession.id)
					saveMessage.mutate({ sessionId: newSession.id, role: "user", content: message })
					return newSession.id
				})
				sessionPromiseRef.current = p
				// Don't add a .catch here — the streaming callback's .catch already
				// handles the rejection to avoid double-logging.
			}
		},
		[submit, createSession, saveMessage, onSessionCreated]
	)

	const handleChartTypeChange = useCallback(
		(messageId: string, type: ChartType) => {
			const sid = sessionIdRef.current
			if (!sid) return

			// Always apply in-memory immediately for snappy UI.
			setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, chartTypeOverride: type } : m)))

			// Only persist when messageId is a real DB UUID (36-char format).
			// Client-generated temp IDs (8-char) would fail z.string().uuid() validation.
			const isDbUuid = messageId.length === 36 && messageId[8] === "-"
			if (isDbUuid) {
				updateChartType.mutate({ messageId, sessionId: sid, chartTypeOverride: type })
			} else {
				// Temp ID: stash the selection so the DB sync effect can persist it once
				// this message receives its real UUID (positional flush in sync effect).
				pendingChartOverridesRef.current.set(messageId, type)
			}
		},
		[updateChartType]
	)

	return {
		messages,
		isStreaming,
		loadingMessages,
		handleSubmit,
		handleAbort,
		handleChartTypeChange,
	}
}
