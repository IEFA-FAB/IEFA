import { useVirtualizer } from "@tanstack/react-virtual"
import { useCallback, useEffect, useRef, useState } from "react"
import { useChatMessages, useCreateChatSession, useSaveChatMessage, useUpdateMessageChartType } from "@/hooks/data/useAnalyticsChatHistory"
import { useAnalyticsStream } from "@/lib/analytics-chat.stream"
import type { ChartType, ChatMessage, StreamEvent } from "@/types/domain/analytics-chat"
import { ChatInput } from "./ChatInput"
import { ChatMessageBubble } from "./ChatMessage"
import { SuggestedPrompts } from "./SuggestedPrompts"

function generateId() {
	return Math.random().toString(36).slice(2, 10)
}

/** Derive a session title from the first user message */
function titleFromMessage(msg: string) {
	const trimmed = msg.replace(/\s+/g, " ").trim()
	return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed
}

// ── Props ────────────────────────────────────────────────────────────────────

interface ChatInterfaceProps {
	sessionId: string | undefined
	onSessionCreated: (id: string) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function ChatInterface({ sessionId, onSessionCreated }: ChatInterfaceProps) {
	const [messages, setMessages] = useState<ChatMessage[]>([])

	// Refs that never cause re-renders
	const parentRef = useRef<HTMLDivElement>(null)
	const messagesRef = useRef<ChatMessage[]>([])
	const pendingAssistantId = useRef<string | null>(null)
	const sessionIdRef = useRef<string | undefined>(sessionId)
	const isAtBottomRef = useRef(true)

	// Keep refs in sync
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

	// Sync persisted messages from DB into state.
	// Skips while streaming (in-memory state is richer) or while a save is
	// in-flight (in-memory has messages the DB doesn't yet).
	useEffect(() => {
		if (!sessionId) {
			setMessages([])
			return
		}
		if (!loadedMessages) return

		// Don't overwrite in-memory state while actively streaming
		if (pendingAssistantId.current) return

		// Don't overwrite if we have more messages than DB (save in progress)
		if (messagesRef.current.length > 0 && messagesRef.current.length > loadedMessages.length) return

		setMessages(
			loadedMessages.map((m) => ({
				id: m.id,
				role: m.role as "user" | "assistant",
				content: m.content,
				chart: (m.chart as unknown as ChatMessage["chart"]) ?? undefined,
				chartTypeOverride: (m.chart_type_override as ChartType | null) ?? undefined,
				error: m.error ?? undefined,
				createdAt: new Date(m.created_at),
			}))
		)
	}, [sessionId, loadedMessages])

	// ── Virtual list ──────────────────────────────────────────────────────────
	const virtualizer = useVirtualizer({
		count: messages.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 100,
		overscan: 5,
	})

	// ── Scroll tracking ───────────────────────────────────────────────────────
	const handleScroll = useCallback(() => {
		const el = parentRef.current
		if (!el) return
		isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150
	}, [])

	useEffect(() => {
		if (messages.length === 0 || !isAtBottomRef.current) return
		virtualizer.scrollToIndex(messages.length - 1, { align: "end", behavior: "auto" })
	}, [messages.length, virtualizer])

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
					else if (event.type === "done") msg.isStreaming = false
					else if (event.type === "error") {
						msg.error = event.message
						msg.isStreaming = false
					}
					const updated = [...prev]
					updated[idx] = msg
					// Sync ref eagerly so the persistence callback (setTimeout)
					// sees the latest accumulated state — useEffect may fire after it.
					messagesRef.current = updated
					return updated
				})

				// Persist assistant message on completion
				if (event.type === "done" || event.type === "error") {
					pendingAssistantId.current = null

					// Save assistant message to DB after React commits the state update.
					// Use setTimeout so messagesRef has the final accumulated content.
					// Phase 1 — wait for session (up to 3 s if first message in new session).
					// Phase 2 — mutateAsync with exponential-backoff retry (up to 3 attempts).
					const trySave = (sessionAttempt = 0) => {
						const sid = sessionIdRef.current
						if (!sid) {
							if (sessionAttempt < 20) setTimeout(() => trySave(sessionAttempt + 1), 150)
							return
						}
						const latest = messagesRef.current.find((m) => m.id === id)
						if (!latest) return

						const doSave = async (saveAttempt = 0): Promise<void> => {
							try {
								await saveMessage.mutateAsync({
									sessionId: sid,
									role: "assistant",
									content: latest.content,
									chart: latest.chart,
									error: latest.error,
								})
							} catch (_err) {
								if (saveAttempt < 3) {
									// Exponential backoff: 1 s, 2 s, 4 s
									setTimeout(() => void doSave(saveAttempt + 1), 1000 * 2 ** saveAttempt)
								} else {
									// max retries reached, fail silently
								}
							}
						}
						void doSave()
					}
					setTimeout(trySave, 0)
				}
			},
			[saveMessage]
		)
	)

	// RAF sticky-scroll during streaming
	useEffect(() => {
		if (!isStreaming) return
		let rafId: number
		const pin = () => {
			if (isAtBottomRef.current) {
				const el = parentRef.current
				if (el) el.scrollTop = el.scrollHeight - el.clientHeight
			}
			rafId = requestAnimationFrame(pin)
		}
		rafId = requestAnimationFrame(pin)
		return () => cancelAnimationFrame(rafId)
	}, [isStreaming])

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

			isAtBottomRef.current = true

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

			// Persist session + user message in parallel (fire-and-forget)
			const sid = sessionIdRef.current
			if (sid) {
				// Session exists — just save the user message
				saveMessage.mutate({ sessionId: sid, role: "user", content: message })
			} else {
				// First message — create session, then save user message
				createSession
					.mutateAsync(titleFromMessage(message))
					.then((newSession) => {
						sessionIdRef.current = newSession.id
						onSessionCreated(newSession.id)
						saveMessage.mutate({ sessionId: newSession.id, role: "user", content: message })
					})
					.catch(() => {
						// Session creation failed — stream still works in-memory
					})
			}
		},
		[submit, createSession, saveMessage, onSessionCreated]
	)

	const handleChartTypeChange = useCallback(
		(messageId: string, type: ChartType) => {
			const sid = sessionIdRef.current
			if (!sid) return
			// Update in-memory state immediately for snappy UI
			setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, chartTypeOverride: type } : m)))
			// Only persist when messageId is a real DB UUID (36-char format).
			// Client-generated temp IDs (8-char) would fail z.string().uuid() validation.
			// After the DB sync effect replaces IDs with UUIDs, subsequent calls will persist.
			const isDbUuid = messageId.length === 36 && messageId[8] === "-"
			if (isDbUuid) {
				updateChartType.mutate({ messageId, sessionId: sid, chartTypeOverride: type })
			}
		},
		[updateChartType]
	)

	// ── Render ────────────────────────────────────────────────────────────────
	const virtualItems = virtualizer.getVirtualItems()
	const hasMessages = messages.length > 0

	return (
		<div className="flex h-full flex-col">
			{/* Message list */}
			<div ref={parentRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
				{hasMessages ? (
					/* In-memory messages always win — never clobber with a spinner */
					<div className="relative mx-auto w-full max-w-3xl px-4" style={{ height: `${virtualizer.getTotalSize()}px` }}>
						{virtualItems.map((vItem) => {
							const message = messages[vItem.index]
							if (!message) return null
							return (
								<div
									key={vItem.key}
									data-index={vItem.index}
									ref={virtualizer.measureElement}
									style={{
										position: "absolute",
										top: 0,
										left: 0,
										width: "100%",
										transform: `translateY(${vItem.start}px)`,
										paddingTop: "12px",
										paddingBottom: "12px",
									}}
								>
									<ChatMessageBubble message={message} onChartTypeChange={handleChartTypeChange} />
								</div>
							)
						})}
					</div>
				) : loadingMessages ? (
					<div className="flex items-center justify-center py-20">
						<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					</div>
				) : (
					<SuggestedPrompts onSelect={handleSubmit} />
				)}
			</div>

			{/* Input bar */}
			<div className="shrink-0 border-t border-border bg-background/80 backdrop-blur-sm px-4 py-3">
				<div className="mx-auto max-w-3xl">
					<ChatInput onSubmit={handleSubmit} onAbort={handleAbort} isStreaming={isStreaming} />
					<p className="mt-1.5 text-center text-[11px] text-muted-foreground">Os dados são consultados em tempo real. Resultados limitados a 500 registros.</p>
				</div>
			</div>
		</div>
	)
}
