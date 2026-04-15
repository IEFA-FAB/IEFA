import { AlertCircle, Bot, Check, Copy, User } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { ChatMarkdown } from "@/components/ui/chat-markdown"
import { cn } from "@/lib/cn"
import type { ChartType, ChatMessage as ChatMessageType } from "@/types/domain/analytics-chat"
import { ChartTypeSelector } from "./ChartTypeSelector"
import { ChatChart } from "./ChatChart"

interface ChatMessageProps {
	message: ChatMessageType
	/** Called when the user overrides the chart type. messageId is the DB UUID (available after save+sync). */
	onChartTypeChange?: (messageId: string, type: ChartType) => void
}

export function ChatMessageBubble({ message, onChartTypeChange }: ChatMessageProps) {
	// Initialise from persisted override; falls back to undefined (= use spec.type)
	const [chartType, setChartType] = useState<ChartType | undefined>(message.chartTypeOverride)
	const [copied, setCopied] = useState(false)
	const isUser = message.role === "user"

	// Keep local state in sync if the message is replaced (e.g. after DB sync)
	const prevOverrideRef = useRef(message.chartTypeOverride)
	useEffect(() => {
		if (message.chartTypeOverride !== prevOverrideRef.current) {
			prevOverrideRef.current = message.chartTypeOverride
			setChartType(message.chartTypeOverride)
		}
	}, [message.chartTypeOverride])

	const handleChartTypeChange = useCallback(
		(type: ChartType) => {
			setChartType(type)
			onChartTypeChange?.(message.id, type)
		},
		[message.id, onChartTypeChange]
	)

	const handleCopy = useCallback(() => {
		void navigator.clipboard.writeText(message.content)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}, [message.content])

	return (
		<div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
			{/* Avatar */}
			<div
				className={cn(
					"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium mt-0.5",
					isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"
				)}
			>
				{isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
			</div>

			{/* Bubble */}
			<div className={cn("flex max-w-[85%] flex-col gap-2", isUser ? "items-end" : "items-start")}>
				<div
					className={cn(
						"rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
						isUser ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm"
					)}
				>
					{message.content ? (
						<>
							{/* rehypeSanitize removed — content is AI-generated (not user input)
								   and ReactMarkdown already escapes raw HTML without rehypeRaw.
								   The default GitHub schema was stripping attributes/elements
								   that could interfere with GFM tables and code blocks. */}
							<ChatMarkdown>{message.content}</ChatMarkdown>
							{message.isStreaming && !message.chart ? <span className="mt-1 inline-block h-4 w-0.5 animate-pulse rounded bg-current align-middle" /> : null}
						</>
					) : message.isStreaming ? (
						<span className="inline-flex items-center gap-1">
							<span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
							<span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
							<span className="h-2 w-2 animate-bounce rounded-full bg-current" />
						</span>
					) : null}
				</div>

				{/* Copy button — assistant only, after streaming completes */}
				{!isUser && message.content && !message.isStreaming && (
					<button
						type="button"
						onClick={handleCopy}
						className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label={copied ? "Copiado!" : "Copiar resposta"}
					>
						{copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
						{copied ? "Copiado!" : "Copiar"}
					</button>
				)}

				{/* Error */}
				{message.error && (
					<div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
						<AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
						{message.error}
					</div>
				)}

				{/* Chart */}
				{message.chart && (
					<div className="w-full max-w-2xl space-y-2">
						<ChartTypeSelector value={chartType ?? message.chart.type} onChange={handleChartTypeChange} />
						<ChatChart spec={message.chart} overrideType={chartType} />
					</div>
				)}
			</div>
		</div>
	)
}
