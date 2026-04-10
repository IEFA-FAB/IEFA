import { AlertCircle, Bot, User } from "lucide-react"
import { useState } from "react"
import ReactMarkdown from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/cn"
import type { ChartType, ChatMessage as ChatMessageType } from "@/types/domain/analytics-chat"
import { ChartTypeSelector } from "./ChartTypeSelector"
import { ChatChart } from "./ChatChart"

interface ChatMessageProps {
	message: ChatMessageType
}

export function ChatMessageBubble({ message }: ChatMessageProps) {
	const [chartType, setChartType] = useState<ChartType | undefined>(undefined)
	const isUser = message.role === "user"

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
			<div className={cn("flex max-w-[85%] flex-col gap-3", isUser ? "items-end" : "items-start")}>
				<div
					className={cn(
						"rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
						isUser ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm"
					)}
				>
					{message.content ? (
						<>
							<ReactMarkdown
								remarkPlugins={[remarkGfm, remarkBreaks]}
								rehypePlugins={[rehypeSanitize]}
								components={{
									p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
									code: ({ children }) => <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs">{children}</code>,
									pre: ({ children }) => <pre className="mt-2 overflow-auto rounded-md bg-black/10 p-3 font-mono text-xs">{children}</pre>,
								}}
							>
								{message.content}
							</ReactMarkdown>
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
						<ChartTypeSelector value={chartType ?? message.chart.type} onChange={setChartType} />
						<ChatChart spec={message.chart} overrideType={chartType} />
					</div>
				)}
			</div>
		</div>
	)
}
