import { useQuery, useQueryClient } from "@tanstack/react-query"
import { SendDiagonal, WarningTriangle } from "iconoir-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/useAuth"
import { chatKeys, chatThreadQueryOptions, streamTurn } from "@/lib/alpha/chat"
import { type ChatMessage, type ChatPhase, describeChatError, PHASE_LABEL } from "@/lib/alpha/chat-model"
import { CitationList } from "./CitationList"
import { MessageBody } from "./MessageBody"

/** Resposta que está chegando — some quando a conversa relida já a contém. */
type Pending = { question: string; text: string; phase: ChatPhase }

/**
 * Uma conversa: histórico, resposta em streaming e o campo de pergunta.
 *
 * O texto que chega aos pedaços é só prévia. No `complete` a conversa é relida do α, e o que
 * fica na tela é a mensagem gravada — com as citações já conferidas no servidor.
 */
export function ChatThreadView({
	threadId,
	draft,
	onDraftConsumed,
	autoSend,
	onAutoSent,
	emptyState,
	header,
}: {
	threadId: string
	/** Pergunta a ENVIAR assim que a conversa abre — a primeira, feita antes de a conversa existir. */
	autoSend?: string | null
	onAutoSent?: () => void
	/** Pergunta pronta vinda de fora (o atalho do achado): vai para o campo, sem enviar. */
	draft?: string | null
	onDraftConsumed?: () => void
	emptyState?: ReactNode
	header?: ReactNode
}) {
	const { session } = useAuth()
	const token = session?.access_token
	const queryClient = useQueryClient()
	const thread = useQuery(chatThreadQueryOptions(token, threadId))

	const [input, setInput] = useState("")
	const [pending, setPending] = useState<Pending | null>(null)
	const [error, setError] = useState<string | null>(null)
	const abortRef = useRef<AbortController | null>(null)
	const endRef = useRef<HTMLDivElement | null>(null)
	const inputRef = useRef<HTMLTextAreaElement | null>(null)

	useEffect(() => {
		if (!draft) return
		setInput(draft)
		onDraftConsumed?.()
		inputRef.current?.focus()
	}, [draft, onDraftConsumed])

	// Trocar de conversa ou sair da tela corta o turno em andamento: o α para de pagar modelo.
	// biome-ignore lint/correctness/useExhaustiveDependencies: o efeito reage à troca de conversa, e `threadId` é o gatilho
	useEffect(() => {
		setPending(null)
		setError(null)
		return () => abortRef.current?.abort()
	}, [threadId])

	const messageCount = thread.data?.messages.length ?? 0
	const pendingLength = pending?.text.length ?? 0
	// biome-ignore lint/correctness/useExhaustiveDependencies: rolar quando chega mensagem nova ou texto novo
	useEffect(() => {
		endRef.current?.scrollIntoView({ block: "end" })
	}, [messageCount, pendingLength])

	const canContinue = thread.data?.can_continue ?? true
	const busy = pending !== null

	const send = async (question: string) => {
		const text = question.trim()
		if (!text || busy || !canContinue) return
		setError(null)
		setInput("")
		setPending({ question: text, text: "", phase: "pensando" })
		const controller = new AbortController()
		abortRef.current = controller
		try {
			await streamTurn(
				token,
				threadId,
				text,
				{
					onPhase: (phase) => setPending((current) => (current ? { ...current, phase } : current)),
					onDelta: (delta) => setPending((current) => (current ? { ...current, text: current.text + delta } : current)),
				},
				controller.signal
			)
		} catch (turnError) {
			if (controller.signal.aborted) return
			setError(describeChatError(turnError))
			// A pergunta volta ao campo para reenvio — a recusa antes do SSE nem a gravou.
			setInput((current) => current || text)
		} finally {
			if (!controller.signal.aborted) {
				await queryClient.invalidateQueries({ queryKey: chatKeys.thread(threadId) })
				await queryClient.invalidateQueries({ queryKey: chatKeys.all, refetchType: "none" })
				setPending(null)
			}
		}
	}

	// A primeira pergunta de uma conversa recém-criada: enviada uma vez, quando a conversa carrega.
	const autoSent = useRef(false)
	// biome-ignore lint/correctness/useExhaustiveDependencies: dispara uma vez por pergunta pendente; `send` muda a cada render
	useEffect(() => {
		if (!autoSend || autoSent.current || !thread.data) return
		autoSent.current = true
		onAutoSent?.()
		void send(autoSend)
	}, [autoSend, thread.data])

	const messages = thread.data?.messages ?? []

	return (
		<div className="flex h-full min-h-0 flex-col">
			{header}

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
				{thread.isLoading ? <p className="text-muted-foreground text-sm">carregando a conversa…</p> : null}
				{thread.isError ? <p className="text-sm">{describeChatError(thread.error)}</p> : null}
				{thread.data && messages.length === 0 && !pending ? emptyState : null}

				{messages.map((message, index) => (
					<MessageItem key={message.id} message={message} onRetry={retryFor(messages, index, setInput)} />
				))}

				{pending ? (
					<>
						<UserBubble text={pending.question} />
						<section className="mb-5">
							<p className="text-label mb-1 text-muted-foreground">Assistente · {PHASE_LABEL[pending.phase]}</p>
							{pending.text ? <MessageBody content={pending.text} citations={[]} /> : <p className="animate-pulse text-muted-foreground text-sm">…</p>}
						</section>
					</>
				) : null}
				<div ref={endRef} />
			</div>

			<div className="border-border border-t p-3">
				{error ? (
					<p className="mb-2 flex items-start gap-2 text-sm" role="alert">
						<WarningTriangle className="mt-0.5 size-4 shrink-0" />
						{error}
					</p>
				) : null}
				{!canContinue ? (
					<p className="text-muted-foreground text-sm">Você não tem mais acesso a este processo. A conversa continua disponível para leitura.</p>
				) : (
					<form
						className="flex items-end gap-2"
						onSubmit={(event) => {
							event.preventDefault()
							void send(input)
						}}
					>
						<Textarea
							ref={inputRef}
							value={input}
							onChange={(event) => setInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
									event.preventDefault()
									void send(input)
								}
							}}
							placeholder="Pergunte sobre o documento, um achado ou a norma…"
							aria-label="Pergunta"
							maxLength={8000}
							className="max-h-48 min-h-10 resize-none"
							disabled={busy}
						/>
						<Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Enviar pergunta">
							<SendDiagonal />
						</Button>
					</form>
				)}
				<p className="mt-2 text-[11px] text-muted-foreground">
					O assistente apoia a redação e a leitura da norma; não substitui a verificação nem o parecer do ACI. Confira as fontes.
				</p>
			</div>
		</div>
	)
}

/** Resposta interrompida: "perguntar de novo" devolve ao campo a pergunta que a antecedeu. */
function retryFor(messages: readonly ChatMessage[], index: number, setInput: (value: string) => void): (() => void) | undefined {
	const message = messages[index]
	if (message.role !== "assistant" || message.status === "complete") return undefined
	const question = messages[index - 1]
	return question?.role === "user" ? () => setInput(question.content) : undefined
}

function UserBubble({ text }: { text: string }) {
	return (
		<section className="mb-4 ml-8 border border-border bg-muted/60 px-3 py-2">
			<p className="text-label mb-1 text-muted-foreground">Você</p>
			<p className="whitespace-pre-wrap text-sm">{text}</p>
		</section>
	)
}

function MessageItem({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
	const [open, setOpen] = useState<string | null>(null)
	if (message.role === "user") return <UserBubble text={message.content} />

	const toggle = (label: string) => setOpen((current) => (current === label ? null : label))
	return (
		<section className="mb-5">
			<p className="text-label mb-1 text-muted-foreground">Assistente</p>
			{message.content ? <MessageBody content={message.content} citations={message.citations} onCite={toggle} /> : null}
			{message.status !== "complete" ? (
				<p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
					{message.status === "aborted" ? "Resposta interrompida." : "A resposta falhou."}
					{onRetry ? (
						<Button size="xs" variant="outline" onClick={onRetry}>
							perguntar de novo
						</Button>
					) : null}
				</p>
			) : null}
			<CitationList citations={message.citations} open={open} onToggle={toggle} />
		</section>
	)
}
