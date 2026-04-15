import { ArrowUp, Square } from "lucide-react"
import { type KeyboardEvent, useRef } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"

interface ModuleChatInputProps {
	onSubmit: (message: string) => void
	onAbort?: () => void
	isStreaming: boolean
	disabled?: boolean
	placeholder?: string
}

export function ModuleChatInput({ onSubmit, onAbort, isStreaming, disabled, placeholder = "Digite sua mensagem…" }: ModuleChatInputProps) {
	const ref = useRef<HTMLTextAreaElement>(null)

	function handleSubmit() {
		const value = ref.current?.value.trim()
		if (!value) return
		if (ref.current) ref.current.value = ""
		onSubmit(value)
	}

	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
			e.preventDefault()
			if (!isStreaming) handleSubmit()
		}
	}

	return (
		<div className="relative flex items-end gap-2 rounded-xl border border-border bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/30 transition-shadow">
			<textarea
				ref={ref}
				rows={1}
				disabled={disabled || isStreaming}
				placeholder={placeholder}
				onKeyDown={handleKeyDown}
				className={cn(
					"flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground outline-none",
					"min-h-[36px] max-h-[200px] overflow-y-auto py-1.5 px-1",
					"field-sizing-content"
				)}
			/>
			{isStreaming ? (
				<Button size="icon" variant="outline" className="shrink-0 h-8 w-8" onClick={onAbort} aria-label="Parar geração">
					<Square className="h-3.5 w-3.5 fill-current" />
				</Button>
			) : (
				<Button size="icon" className="shrink-0 h-8 w-8" disabled={disabled} onClick={handleSubmit} aria-label="Enviar">
					<ArrowUp className="h-4 w-4" />
				</Button>
			)}
		</div>
	)
}
