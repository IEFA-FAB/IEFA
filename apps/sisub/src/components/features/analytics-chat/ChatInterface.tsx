import { useCallback, useEffect, useRef, useState } from "react"
import { useAnalyticsStream } from "@/lib/analytics-chat.stream"
import type { ChatMessage, StreamEvent } from "@/types/domain/analytics-chat"
import { ChatInput } from "./ChatInput"
import { ChatMessageBubble } from "./ChatMessage"
import { SuggestedPrompts } from "./SuggestedPrompts"

function generateId() {
	return Math.random().toString(36).slice(2, 10)
}

export function ChatInterface() {
	const [messages, setMessages] = useState<ChatMessage[]>([])
	const bottomRef = useRef<HTMLDivElement>(null)
	const messagesRef = useRef<ChatMessage[]>([])
	const pendingAssistantId = useRef<string | null>(null)

	useEffect(() => {
		messagesRef.current = messages
	}, [messages])

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" })
	}, [])

	const onEvent = useCallback((event: StreamEvent) => {
		const id = pendingAssistantId.current
		if (!id) return

		setMessages((prev) => {
			const idx = prev.findIndex((m) => m.id === id)
			if (idx === -1) return prev

			const msg = { ...prev[idx] }

			if (event.type === "text_delta") {
				msg.content = (msg.content ?? "") + event.delta
			} else if (event.type === "chart_spec") {
				msg.chart = event.spec
			} else if (event.type === "done") {
				msg.isStreaming = false
			} else if (event.type === "error") {
				msg.error = event.message
				msg.isStreaming = false
			}

			const updated = [...prev]
			updated[idx] = msg
			return updated
		})

		if (event.type === "done" || event.type === "error") {
			pendingAssistantId.current = null
		}
	}, [])

	const { submit, abort, isStreaming } = useAnalyticsStream(onEvent)

	const handleAbort = useCallback(() => {
		abort()

		const id = pendingAssistantId.current
		if (!id) return
		pendingAssistantId.current = null

		setMessages((prev) =>
			prev.map((message) =>
				message.id === id
					? {
							...message,
							isStreaming: false,
							error: message.content || message.chart || message.error ? message.error : "Geração interrompida.",
						}
					: message
			)
		)
	}, [abort])

	const handleSubmit = useCallback(
		(message: string) => {
			const history = messagesRef.current.filter((entry) => !entry.isStreaming)

			// Add user message
			const userMsg: ChatMessage = {
				id: generateId(),
				role: "user",
				content: message,
				createdAt: new Date(),
			}

			// Placeholder for assistant response
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
			void submit(message, history)
		},
		[submit]
	)

	return (
		<div className="flex h-full flex-col">
			{/* Message list */}
			<div className="flex-1 overflow-y-auto px-4 py-4">
				{messages.length === 0 ? (
					<SuggestedPrompts onSelect={handleSubmit} />
				) : (
					<div className="mx-auto max-w-3xl space-y-6 pb-4">
						{messages.map((msg) => (
							<ChatMessageBubble key={msg.id} message={msg} />
						))}
						<div ref={bottomRef} />
					</div>
				)}
			</div>

			{/* Input bar */}
			<div className="border-t border-border bg-background/80 backdrop-blur-sm px-4 py-3">
				<div className="mx-auto max-w-3xl">
					<ChatInput onSubmit={handleSubmit} onAbort={handleAbort} isStreaming={isStreaming} />
					<p className="mt-1.5 text-center text-[11px] text-muted-foreground">Os dados são consultados em tempo real. Resultados limitados a 500 registros.</p>
				</div>
			</div>
		</div>
	)
}
