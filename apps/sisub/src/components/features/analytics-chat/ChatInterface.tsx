import { useVirtualizer } from "@tanstack/react-virtual"
import { useCallback, useEffect, useRef } from "react"
import { useChatSession } from "@/hooks/features/useChatSession"
import { ChatInput } from "./ChatInput"
import { ChatMessageBubble } from "./ChatMessage"
import { SuggestedPrompts } from "./SuggestedPrompts"

// ── Props ────────────────────────────────────────────────────────────────────

interface ChatInterfaceProps {
	sessionId: string | undefined
	onSessionCreated: (id: string) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function ChatInterface({ sessionId, onSessionCreated }: ChatInterfaceProps) {
	// ── Session logic (state, streaming, persistence) ─────────────────────────
	const { messages, isStreaming, loadingMessages, handleSubmit, handleAbort, handleChartTypeChange } = useChatSession({ sessionId, onSessionCreated })

	// ── Scroll / virtualizer (UI concern) ─────────────────────────────────────
	const parentRef = useRef<HTMLDivElement>(null)
	const isAtBottomRef = useRef(true)

	const virtualizer = useVirtualizer({
		count: messages.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 100,
		overscan: 5,
	})

	const handleScroll = useCallback(() => {
		const el = parentRef.current
		if (!el) return
		isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150
	}, [])

	// Scroll to bottom when new messages arrive (only if already at bottom)
	useEffect(() => {
		if (messages.length === 0 || !isAtBottomRef.current) return
		virtualizer.scrollToIndex(messages.length - 1, { align: "end", behavior: "auto" })
	}, [messages.length, virtualizer])

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

	// Force scroll-to-bottom whenever the user sends a new message
	const onSubmit = useCallback(
		(message: string) => {
			isAtBottomRef.current = true
			handleSubmit(message)
		},
		[handleSubmit]
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
					<SuggestedPrompts onSelect={onSubmit} />
				)}
			</div>

			{/* Input bar */}
			<div className="shrink-0 border-t border-border bg-background/80 backdrop-blur-sm px-4 py-3">
				<div className="mx-auto max-w-3xl">
					<ChatInput onSubmit={onSubmit} onAbort={handleAbort} isStreaming={isStreaming} />
					<p className="mt-1.5 text-center text-[11px] text-muted-foreground">Os dados são consultados em tempo real. Resultados limitados a 500 registros.</p>
				</div>
			</div>
		</div>
	)
}
