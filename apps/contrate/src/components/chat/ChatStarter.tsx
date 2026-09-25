import { SendDiagonal, WarningTriangle } from "iconoir-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useCreateChat } from "@/lib/alpha/chat"
import { describeChatError } from "@/lib/alpha/chat-model"

/**
 * O campo da PRIMEIRA pergunta, antes de a conversa existir. A conversa só é criada no envio —
 * abrir o painel para olhar não deixa conversa vazia na lista.
 */
export function ChatStarter({
	submissionId,
	draft,
	onDraftConsumed,
	onStarted,
	intro,
}: {
	submissionId: string
	draft?: string | null
	onDraftConsumed?: () => void
	onStarted: (threadId: string, question: string) => void
	intro: ReactNode
}) {
	const create = useCreateChat()
	const [input, setInput] = useState("")
	const inputRef = useRef<HTMLTextAreaElement | null>(null)

	useEffect(() => {
		if (!draft) return
		setInput(draft)
		onDraftConsumed?.()
		inputRef.current?.focus()
	}, [draft, onDraftConsumed])

	const start = () => {
		const question = input.trim()
		if (!question || create.isPending) return
		create.mutate({ submissionId }, { onSuccess: (thread) => onStarted(thread.id, question) })
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{intro}</div>
			<div className="border-border border-t p-3">
				{create.isError ? (
					<p className="mb-2 flex items-start gap-2 text-sm" role="alert">
						<WarningTriangle className="mt-0.5 size-4 shrink-0" />
						{describeChatError(create.error)}
					</p>
				) : null}
				<form
					className="flex items-end gap-2"
					onSubmit={(event) => {
						event.preventDefault()
						start()
					}}
				>
					<Textarea
						ref={inputRef}
						value={input}
						onChange={(event) => setInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
								event.preventDefault()
								start()
							}
						}}
						placeholder="Pergunte sobre o documento, um achado ou a norma…"
						aria-label="Pergunta"
						maxLength={8000}
						className="max-h-48 min-h-10 resize-none"
						disabled={create.isPending}
					/>
					<Button type="submit" size="icon" disabled={create.isPending || !input.trim()} aria-label="Enviar pergunta">
						<SendDiagonal />
					</Button>
				</form>
				<p className="mt-2 text-[11px] text-muted-foreground">
					O assistente apoia a redação e a leitura da norma; não substitui a verificação nem o parecer do ACI. Confira as fontes.
				</p>
			</div>
		</div>
	)
}
