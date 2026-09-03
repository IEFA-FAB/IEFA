import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Undo, WarningTriangle } from "iconoir-react"
import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toPayload } from "@/lib/comaer/schema"
import type { DocumentInput } from "@/lib/comaer/types"
import { appendChatHistoryFn, loadChatHistoryFn } from "@/server/chat-history.fn"

/**
 * Redação assistida.
 *
 * O documento vai INTEIRO em `forwardedProps` a cada turno e volta em remendos: o modelo
 * chama ferramentas, e é o cliente que as aplica. Assim o formulário continua editável
 * durante a conversa — se o servidor gravasse, o turno seguinte sobrescreveria o que o
 * usuário digitou à mão.
 *
 * Cada chamada é aplicada UMA vez: o stream reemite a mesma parte a cada delta enquanto os
 * argumentos chegam, e aplicar de novo duplicaria parágrafo.
 */
export function ChatPanel({
	document,
	documentId,
	changes,
	canUndo,
	onBeginTurn,
	onPatch,
	onUndo,
	onStreamingChange,
}: {
	document: DocumentInput
	/** Documento salvo: só ele tem histórico. Rascunho de navegador conversa de memória. */
	documentId: string | null
	changes: number
	canUndo: boolean
	onBeginTurn: () => void
	onPatch: (name: string, args: Record<string, unknown>) => void
	onUndo: () => void
	/** O editor precisa saber que há um turno em curso para não salvar pela metade. */
	onStreamingChange?: (streaming: boolean) => void
}) {
	const history = useQuery({
		queryKey: ["chat-history", documentId],
		queryFn: () => (documentId ? loadChatHistoryFn({ data: { documentId } }) : Promise.resolve([])),
		enabled: Boolean(documentId),
	})

	// `useChat` lê `initialMessages` UMA vez, na montagem. O histórico chega depois, então a
	// conversa é remontada quando o documento (ou o histórico dele) muda — sem a `key`, o
	// painel abria vazio sobre um documento que tinha conversa gravada.
	if (documentId && history.isLoading) {
		return (
			<ChatShell changes={changes} canUndo={canUndo} onUndo={onUndo}>
				<p className="p-4 text-sm text-muted-foreground">Carregando a conversa deste documento…</p>
			</ChatShell>
		)
	}

	return (
		<Conversation
			key={`${documentId ?? "novo"}:${history.data?.length ?? 0}`}
			document={document}
			documentId={documentId}
			history={history.data ?? []}
			changes={changes}
			canUndo={canUndo}
			onBeginTurn={onBeginTurn}
			onPatch={onPatch}
			onUndo={onUndo}
			onStreamingChange={onStreamingChange}
		/>
	)
}

/** Moldura comum: cabeçalho com contagem do turno e desfazer. */
function ChatShell({ changes, canUndo, onUndo, children }: { changes: number; canUndo: boolean; onUndo: () => void; children: React.ReactNode }) {
	return (
		<section className="border border-border flex flex-col min-h-[32rem]">
			<header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
				<h3 className="text-label text-foreground">Redação assistida</h3>
				<div className="flex items-center gap-3">
					{changes > 0 && (
						<span className="text-label text-muted-foreground">
							{changes} {changes === 1 ? "alteração" : "alterações"} neste turno
						</span>
					)}
					{canUndo && (
						<Button type="button" variant="ghost" size="sm" onClick={onUndo}>
							<Undo className="size-4" /> Desfazer turno
						</Button>
					)}
				</div>
			</header>
			{children}
		</section>
	)
}

function Conversation({
	document,
	documentId,
	history,
	changes,
	canUndo,
	onBeginTurn,
	onPatch,
	onUndo,
	onStreamingChange,
}: {
	document: DocumentInput
	documentId: string | null
	history: { role: "user" | "assistant"; content: string }[]
	changes: number
	canUndo: boolean
	onBeginTurn: () => void
	onPatch: (name: string, args: Record<string, unknown>) => void
	onUndo: () => void
	onStreamingChange?: (streaming: boolean) => void
}) {
	const [text, setText] = useState("")
	const [interrupted, setInterrupted] = useState(false)
	const applied = useRef(new Set<string>())
	const bottom = useRef<HTMLDivElement>(null)

	const connection = useMemo(() => fetchServerSentEvents("/api/comunicacoes/chat"), [])

	// O payload é montado no envio; documento em estado intermediário não pode derrubar o
	// painel, então uma falha de serialização vira ausência de contexto, não exceção.
	const forwardedProps = useMemo(() => {
		try {
			return { document: toPayload(document) }
		} catch {
			return {}
		}
	}, [document])

	const initialMessages = useMemo(
		() => history.map((message, i) => ({ id: `history-${i}`, role: message.role, parts: [{ type: "text" as const, content: message.content }] })),
		[history]
	)

	const { messages, sendMessage, isLoading, error, stop } = useChat({ connection, forwardedProps, initialMessages })

	useEffect(() => {
		onStreamingChange?.(isLoading)
	}, [isLoading, onStreamingChange])

	useEffect(() => {
		for (const message of messages) {
			if (message.role !== "assistant") continue
			for (const part of message.parts) {
				if (part.type !== "tool-call") continue
				// Só quando os argumentos terminaram de chegar: aplicar no meio do stream
				// entregaria JSON pela metade.
				if (part.input === undefined || applied.current.has(part.id)) continue
				applied.current.add(part.id)
				onPatch(part.name, part.input as Record<string, unknown>)
			}
		}
		// Rolagem suave é enjoo para quem pediu menos movimento no sistema.
		const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
		bottom.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" })
	}, [messages, onPatch])

	// O histórico já está no banco: persistir de novo duplicaria a conversa a cada abertura.
	const persisted = useRef(history.length)
	useEffect(() => {
		if (!documentId || isLoading || messages.length === 0) return
		const pending = messages
			.slice(persisted.current)
			.filter((message) => message.role === "user" || message.role === "assistant")
			.map((message) => ({
				role: message.role as "user" | "assistant",
				content: message.parts
					.filter((part) => part.type === "text")
					.map((part) => (part as { content: string }).content)
					.join("\n")
					.trim(),
			}))
			.filter((message) => message.content.length > 0)
		if (pending.length === 0) return
		persisted.current = messages.length
		// Resposta interrompida é gravada COMO interrompida: sem a marca, ao reabrir o
		// documento o histórico mostra meio parágrafo como se fosse a resposta inteira.
		const marked = interrupted
			? pending.map((m, i) => (i === pending.length - 1 && m.role === "assistant" ? { ...m, content: `${m.content}\n\n[turno interrompido]` } : m))
			: pending
		void appendChatHistoryFn({ data: { documentId, messages: marked.slice(-10) } })
	}, [messages, isLoading, documentId, interrupted])

	const send = async () => {
		const message = text.trim()
		if (!message || isLoading) return
		setInterrupted(false)
		onBeginTurn()
		try {
			await sendMessage(message)
			// O campo só é limpo quando a mensagem partiu. Limpar antes jogava fora cinco
			// linhas de pedido quando o SSE não abria.
			setText("")
		} catch {
			// O erro já é exibido; o texto fica onde está para reenviar.
		}
	}

	const classified = document.classification !== "ostensivo"

	return (
		<ChatShell changes={changes} canUndo={canUndo} onUndo={onUndo}>
			{classified ? (
				<div className="flex items-start gap-2 p-4 text-sm">
					<WarningTriangle className="size-4 shrink-0 mt-0.5 text-destructive" />
					<p className="text-muted-foreground">
						Documento sigiloso não sai desta rede: nem o texto nem os anexos são enviados a serviço de inteligência artificial. Redija no formulário — a folha,
						a conferência e a cópia para o SIGADAER continuam funcionando.
					</p>
				</div>
			) : (
				<>
					{/* Região viva: sem ela, quem usa leitor de tela não recebe a resposta do
					    modelo — e este é o modo primário da ferramenta. */}
					<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 max-h-[28rem]" aria-live="polite" aria-busy={isLoading}>
						{messages.length === 0 && (
							<p className="text-sm text-muted-foreground">
								Diga o que o documento precisa dizer. A redação assistida escolhe a espécie, escreve o texto na forma da NSCA 5-3 e pergunta o que faltar —
								numeração, NUP, OM e signatário continuam sendo seus, e se preenchem em “Dados do expediente”.
							</p>
						)}
						{messages.map((message) => (
							<div key={message.id} className={message.role === "user" ? "self-end max-w-[85%]" : "max-w-[95%]"}>
								<div className={`border border-border px-3 py-2 text-sm ${message.role === "user" ? "bg-accent" : "bg-card"}`}>
									{message.parts.map((part, i) =>
										part.type === "text" ? (
											<p key={`${message.id}-${i}`} className="whitespace-pre-wrap">
												{part.content}
											</p>
										) : part.type === "tool-call" ? (
											<p key={`${message.id}-${i}`} className="text-label text-muted-foreground mt-1">
												↳ {part.name}
											</p>
										) : null
									)}
								</div>
							</div>
						))}
						{isLoading && (
							<p role="status" className="text-xs text-muted-foreground">
								Redigindo…
							</p>
						)}
						{interrupted && !isLoading && (
							<p className="text-xs text-muted-foreground">Turno interrompido. As alterações já aplicadas continuam no documento.</p>
						)}
						<div ref={bottom} />
					</div>

					{error && (
						<p role="alert" className="text-xs text-destructive px-4 pb-2">
							{friendlyError(error)} Sua mensagem continua no campo abaixo.
						</p>
					)}

					<div className="border-t border-border p-4 flex items-end gap-2">
						<Textarea
							value={text}
							onChange={(e) => setText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault()
									void send()
								}
							}}
							rows={2}
							placeholder="Ex.: preciso pedir ao COMGEP mais 30 dias para o levantamento; 12 das 31 OM não responderam"
							aria-label="Mensagem para a redação assistida"
						/>
						{isLoading ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => {
									setInterrupted(true)
									stop()
								}}
							>
								Parar
							</Button>
						) : (
							<Button type="button" size="sm" onClick={() => void send()} disabled={text.trim().length === 0} aria-label="Enviar mensagem">
								<ArrowRight className="size-4" />
							</Button>
						)}
					</div>
					<p className="text-xs text-muted-foreground px-4 pb-4">A conversa altera o documento ao lado. Cada turno pode ser desfeito.</p>
				</>
			)}
		</ChatShell>
	)
}

/** Erro de provider e de rede chegam crus; o que a pessoa precisa saber é o que fazer. */
function friendlyError(error: Error): string {
	const message = error.message ?? ""
	if (/429/.test(message)) return "Muitos pedidos em pouco tempo — aguarde alguns segundos e envie de novo."
	if (/503|indispon/i.test(message))
		return "A redação assistida está fora do ar. Escreva o texto no formulário — a folha e a cópia para o SIGADAER continuam funcionando."
	if (/fetch|network|Failed to fetch/i.test(message)) return "Sem conexão com o servidor."
	return "A redação assistida não conseguiu responder."
}
