import { AlertCircle, Bot, Check, Copy, User } from "lucide-react"
import { useCallback, useState } from "react"
import { ChatMarkdown } from "@/components/ui/chat-markdown"
import { cn } from "@/lib/cn"
import type { ModuleChatMessage as ModuleChatMessageType } from "@/types/domain/module-chat"
import { ToolCallDisplay } from "./ToolCallDisplay"

interface ModuleChatMessageProps {
	message: ModuleChatMessageType
}

export function ModuleChatMessageBubble({ message }: ModuleChatMessageProps) {
	const [copied, setCopied] = useState(false)
	const isUser = message.role === "user"
	// Tool messages are filtered out by the parent (ModuleChatInterface).
	// They are displayed inline in assistant messages via ToolCallDisplay.

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
							<ChatMarkdown>{message.content}</ChatMarkdown>
							{message.isStreaming && !message.toolCalls?.length ? (
								<span className="mt-1 inline-block h-4 w-0.5 animate-pulse rounded bg-current align-middle" />
							) : null}
						</>
					) : message.isStreaming ? (
						<span className="inline-flex items-center gap-1">
							<span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
							<span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
							<span className="h-2 w-2 animate-bounce rounded-full bg-current" />
						</span>
					) : null}
				</div>

				{/* Copy button — assistant only, after streaming */}
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

				{/* Tool calls */}
				{message.toolCalls && message.toolCalls.length > 0 && (
					<div className="w-full space-y-1.5">
						{message.toolCalls.map((tc) => (
							<ToolCallDisplay key={tc.id} toolCall={tc} />
						))}
					</div>
				)}
			</div>
		</div>
	)
}
