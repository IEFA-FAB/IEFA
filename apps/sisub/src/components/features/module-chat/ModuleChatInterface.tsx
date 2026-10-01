import { useVirtualizer } from "@tanstack/react-virtual"
import { AlertCircle, ShieldQuestion } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { useModuleChatSession } from "@/hooks/features/useModuleChatSession"
import type { ModuleChatConfig } from "@/types/domain/module-chat"
import { ModuleChatInput } from "./ModuleChatInput"
import { ModuleChatMessageBubble } from "./ModuleChatMessage"
import { ModuleSuggestedPrompts } from "./ModuleSuggestedPrompts"
import type { ToolApprovalContext } from "./ToolApprovalCard"

// ── Props ───────────────────────────────────────────────────────────────────

interface ModuleChatInterfaceProps {
	config: ModuleChatConfig
	sessionId: string | undefined
	onSessionCreated: (id: string) => void
}

// ── Component ───────────────────────────────────────────────────────────────

export function ModuleChatInterface({ config, sessionId, onSessionCreated }: ModuleChatInterfaceProps) {
	const {
		messages,
		isStreaming,
		loadingMessages,
		streamError,
		awaitingApproval,
		approvalSubmitFailed,
		handleSubmit,
		handleAbort,
		handleApprovalDecision,
		handleDiscardPendingAction,
	} = useModuleChatSession({
		sessionId,
		module: config.module,
		scopeId: config.scopeId,
		onSessionCreated,
	})

	const approval = useMemo<ToolApprovalContext>(
		() => ({ module: config.module, scopeId: config.scopeId, onDecide: handleApprovalDecision }),
		[config.module, config.scopeId, handleApprovalDecision]
	)

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
	// Um aviso só, acima do input, para qualquer falha do turno (401, 503, 413 na ida ao
	// provider, rede). Vale inclusive quando o turno morre antes de existir bolha do
	// assistente — o caso em que a tela não mostrava absolutamente nada.
	const showErrorNotice = Boolean(streamError)

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
									<ModuleChatMessageBubble message={message} approval={approval} />
								</div>
							)
						})}
					</div>
				) : loadingMessages ? (
					<div className="flex items-center justify-center py-20">
						<div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					</div>
				) : (
					<ModuleSuggestedPrompts config={config} onSelect={onSubmit} />
				)}
			</div>

			{/* Input bar */}
			<div className="shrink-0 border-t border-border bg-background/80 backdrop-blur-sm px-4 py-3">
				<div className="mx-auto max-w-3xl">
					{showErrorNotice && (
						<div
							role="alert"
							className="mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
						>
							<AlertCircle className="mt-0.5 size-3.5 shrink-0" />
							<span>{streamError}</span>
						</div>
					)}
					{awaitingApproval && (
						<div role="status" className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
							<ShieldQuestion className="size-3.5 shrink-0 text-muted-foreground" />
							{approvalSubmitFailed ? (
								<>
									<span className="flex-1 text-caption text-foreground">Não foi possível enviar sua decisão. A ação não foi executada.</span>
									<Button size="xs" variant="outline" onClick={handleDiscardPendingAction}>
										Descartar ação
									</Button>
								</>
							) : (
								<span className="text-caption text-foreground">Confirme ou recuse a ação acima para continuar a conversa.</span>
							)}
						</div>
					)}
					<ModuleChatInput
						onSubmit={onSubmit}
						onAbort={handleAbort}
						isStreaming={isStreaming}
						disabled={awaitingApproval}
						placeholder={awaitingApproval ? "Confirme ou recuse a ação acima" : config.placeholder}
					/>
					<p className="mt-1.5 text-center text-[11px] text-muted-foreground">{config.disclaimer}</p>
				</div>
			</div>
		</div>
	)
}
