import { useVirtualizer } from "@tanstack/react-virtual"
import { useCallback, useEffect, useRef } from "react"
import { useModuleChatSession } from "@/hooks/features/useModuleChatSession"
import type { ModuleChatConfig } from "@/types/domain/module-chat"
import { ModuleChatInput } from "./ModuleChatInput"
import { ModuleChatMessageBubble } from "./ModuleChatMessage"
import { ModuleSuggestedPrompts } from "./ModuleSuggestedPrompts"

// ── Props ───────────────────────────────────────────────────────────────────

interface ModuleChatInterfaceProps {
	config: ModuleChatConfig
	sessionId: string | undefined
	onSessionCreated: (id: string) => void
}

// ── Component ───────────────────────────────────────────────────────────────

export function ModuleChatInterface({ config, sessionId, onSessionCreated }: ModuleChatInterfaceProps) {
	const { messages, isStreaming, loadingMessages, handleSubmit, handleAbort } = useModuleChatSession({
		sessionId,
		module: config.module,
		scopeId: config.scopeId,
		onSessionCreated,
	})

	// ── Scroll / virtualizer ──────────────────────────────────────────────────
	const parentRef = useRef<HTMLDivElement>(null)
	const isAtBottomRef = useRef(true)

	// Filter out tool messages (rendered inline in assistant messages)
	const visibleMessages = messages.filter((m) => m.role !== "tool")

	const virtualizer = useVirtualizer({
		count: visibleMessages.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 100,
		overscan: 5,
	})

	const handleScroll = useCallback(() => {
		const el = parentRef.current
		if (!el) return
		isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150
	}, [])

	useEffect(() => {
		if (visibleMessages.length === 0 || !isAtBottomRef.current) return
		virtualizer.scrollToIndex(visibleMessages.length - 1, { align: "end", behavior: "auto" })
	}, [visibleMessages.length, virtualizer])

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

	const onSubmit = useCallback(
		(message: string) => {
			isAtBottomRef.current = true
			handleSubmit(message)
		},
		[handleSubmit]
	)

	// ── Render ────────────────────────────────────────────────────────────────
	const virtualItems = virtualizer.getVirtualItems()
	const hasMessages = visibleMessages.length > 0

	return (
		<div className="flex h-full flex-col">
			{/* Message list */}
			<div ref={parentRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
				{hasMessages ? (
					<div className="relative mx-auto w-full max-w-3xl px-4" style={{ height: `${virtualizer.getTotalSize()}px` }}>
						{virtualItems.map((vItem) => {
							const message = visibleMessages[vItem.index]
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
									<ModuleChatMessageBubble message={message} />
								</div>
							)
						})}
					</div>
				) : loadingMessages ? (
					<div className="flex items-center justify-center py-20">
						<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					</div>
				) : (
					<ModuleSuggestedPrompts config={config} onSelect={onSubmit} />
				)}
			</div>

			{/* Input bar */}
			<div className="shrink-0 border-t border-border bg-background/80 backdrop-blur-sm px-4 py-3">
				<div className="mx-auto max-w-3xl">
					<ModuleChatInput onSubmit={onSubmit} onAbort={handleAbort} isStreaming={isStreaming} placeholder={config.placeholder} />
					<p className="mt-1.5 text-center text-[11px] text-muted-foreground">{config.disclaimer}</p>
				</div>
			</div>
		</div>
	)
}
