import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Sparks, Undo, WarningTriangle } from "iconoir-react"
import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toPayload } from "@/lib/comaer/schema"
import type { DocumentInput } from "@/lib/comaer/types"
import { appendChatHistoryFn, loadChatHistoryFn } from "@/server/chat-history.fn"

/**
 * Conversa que redige o documento.
 *
 * O documento vai INTEIRO em `forwardedProps` a cada turno, e volta em remendos: o modelo
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
}: {
	document: DocumentInput
	/** Documento salvo: só ele tem histórico. Rascunho de navegador conversa de memória. */
	documentId: string | null
	changes: number
	canUndo: boolean
	onBeginTurn: () => void
	onPatch: (name: string, args: Record<string, unknown>) => void
	onUndo: () => void
}) {
	const history = useQuery({
		queryKey: ["chat-history", documentId],
		queryFn: () => (documentId ? loadChatHistoryFn({ data: { documentId } }) : Promise.resolve([])),
		enabled: Boolean(documentId),
	})

	// `useChat` lê `initialMessages` UMA vez, na montagem. O histórico chega depois, então
	// a conversa é remontada quando o documento (ou o histórico dele) muda — sem a `key`, o
	// painel abria vazio sobre um documento que tinha conversa gravada.
	if (documentId && history.isLoading)
		return (
			<ChatShell changes={changes} canUndo={canUndo} onUndo={onUndo}>
				{null}
			</ChatShell>
		)

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
		/>
	)
}

/** Moldura comum: cabeçalho com contagem do turno e desfazer. */
function ChatShell({ changes, canUndo, onUndo, children }: { changes: number; canUndo: boolean; onUndo: () => void; children: React.ReactNode }) {
	return (
		<section className="border border-border flex flex-col min-h-[32rem]">
			<header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
				<h3 className="text-sm font-semibold tracking-tight uppercase">Conversa</h3>
				<div className="flex items-center gap-3">
					{changes > 0 && (
						<span className="text-[11px] font-mono text-muted-foreground">
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
}: {
	document: DocumentInput
	documentId: string | null
	history: { role: "user" | "assistant"; content: string }[]
	changes: number
	canUndo: boolean
	onBeginTurn: () => void
	onPatch: (name: string, args: Record<string, unknown>) => void
	onUndo: () => void
}) {
	const [text, setText] = useState("")
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

	// Persistir só o que fechou: mensagem gravada no meio do stream volta pela metade na
	// próxima abertura, e a conversa passa a mentir sobre o que foi dito.
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
		void appendChatHistoryFn({ data: { documentId, messages: pending.slice(-10) } })
	}, [messages, isLoading, documentId])

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
		bottom.current?.scrollIntoView({ behavior: "smooth" })
	}, [messages, onPatch])

	const send = async () => {
		const message = text.trim()
		if (!message || isLoading) return
		setText("")
		onBeginTurn()
		await sendMessage(message)
	}

	const classified = document.classification !== "ostensivo"

	return (
		<ChatShell changes={changes} canUndo={canUndo} onUndo={onUndo}>
			{classified ? (
				<div className="flex items-start gap-2 p-4 text-sm">
					<WarningTriangle className="size-4 shrink-0 mt-0.5 text-destructive" />
					<p className="text-muted-foreground">
						Documento com grau de sigilo <strong>{document.classification}</strong> não é enviado a provider de IA. Redija o texto manualmente.
					</p>
				</div>
			) : (
				<>
					<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 max-h-[28rem]">
						{messages.length === 0 && (
							<p className="text-sm text-muted-foreground">
								Diga o que o documento precisa dizer. Eu escolho a espécie, escrevo o texto na forma da NSCA 5-3 e pergunto o que faltar — numeração, NUP, OM e
								signatário continuam sendo seus.
							</p>
						)}
						{messages.map((message) => (
							<div key={message.id} className={message.role === "user" ? "self-end max-w-[85%]" : "max-w-[95%]"}>
								<div className={`border border-border px-3 py-2 text-sm ${message.role === "user" ? "bg-accent" : "bg-card"}`}>
									{message.parts.map((part, i) =>
										part.type === "text" ? (
											<p key={i} className="whitespace-pre-wrap">
												{part.content}
											</p>
										) : part.type === "tool-call" ? (
											<p key={i} className="text-xs font-mono text-muted-foreground mt-1">
												↳ {part.name}
											</p>
										) : null
									)}
								</div>
							</div>
						))}
						{isLoading && <p className="text-xs text-muted-foreground animate-pulse">Redigindo…</p>}
						<div ref={bottom} />
					</div>

					{error && <p className="text-xs text-destructive px-4 pb-2">{error.message}</p>}

					<div className="border-t border-border p-3 flex items-end gap-2">
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
							<Button type="button" variant="outline" size="sm" onClick={stop}>
								Parar
							</Button>
						) : (
							<Button type="button" size="sm" onClick={() => void send()} disabled={text.trim().length === 0} aria-label="Enviar">
								<ArrowRight className="size-4" />
							</Button>
						)}
					</div>
					<p className="text-[11px] text-muted-foreground px-3 pb-3 flex items-center gap-1">
						<Sparks className="size-3" /> A conversa altera o documento ao lado. Cada turno pode ser desfeito.
					</p>
				</>
			)}
		</ChatShell>
	)
}
