import { useQuery } from "@tanstack/react-query"
import { Plus } from "iconoir-react"
import { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAuth } from "@/hooks/useAuth"
import { chatListQueryOptions } from "@/lib/alpha/chat"
import { formatDateTime } from "@/lib/alpha/format"
import { ChatStarter } from "./ChatStarter"
import { ChatThreadView } from "./ChatThreadView"

/**
 * Chat do processo, num painel lateral da tela do processo.
 *
 * Lista as conversas DO USUÁRIO sobre este processo (as dos colegas são deles) e abre a mais
 * recente. "Nova conversa" volta ao campo da primeira pergunta; a conversa só nasce no envio.
 */
export function ProcessChatPanel({
	submissionId,
	documentName,
	open,
	onOpenChange,
	draft,
	onDraftConsumed,
}: {
	submissionId: string
	documentName: string
	open: boolean
	onOpenChange: (open: boolean) => void
	draft: string | null
	onDraftConsumed: () => void
}) {
	const { session } = useAuth()
	const threads = useQuery({ ...chatListQueryOptions(session?.access_token, { submissionId }), enabled: open && Boolean(session?.access_token) })

	// `undefined` = a mais recente; `null` = nova conversa, ainda sem id.
	const [selected, setSelected] = useState<string | null | undefined>(undefined)
	const [firstQuestion, setFirstQuestion] = useState<string | null>(null)
	const clearFirstQuestion = useCallback(() => setFirstQuestion(null), [])

	const items = threads.data ?? []
	const threadId = selected === undefined ? (items[0]?.id ?? null) : selected

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			{/* Montado mesmo fechado: fechar o painel no meio de uma resposta não a corta (o α
			    gravaria como interrompida e a pergunta contaria no teto diário). */}
			<SheetContent side="right" keepMounted className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
				<SheetHeader className="border-border border-b pr-12">
					<SheetTitle>Conversar sobre o processo</SheetTitle>
					<SheetDescription className="truncate">{documentName}</SheetDescription>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						{items.length > 0 ? (
							<Select value={threadId} onValueChange={(value) => setSelected(value)}>
								<SelectTrigger size="sm" className="w-64" aria-label="Escolher conversa">
									<SelectValue>{threadId ? (items.find((item) => item.id === threadId)?.title ?? "conversa") : "nova conversa"}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{items.map((item) => (
										<SelectItem key={item.id} value={item.id}>
											{item.title ?? "(sem título)"} · {formatDateTime(item.last_activity_at)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : null}
						<Button size="xs" variant="outline" onClick={() => setSelected(null)} disabled={threadId === null}>
							<Plus />
							nova conversa
						</Button>
					</div>
				</SheetHeader>

				<div className="min-h-0 flex-1">
					{threads.isLoading ? (
						<p className="p-4 text-muted-foreground text-sm">carregando conversas…</p>
					) : threadId === null ? (
						<ChatStarter
							submissionId={submissionId}
							draft={draft}
							onDraftConsumed={onDraftConsumed}
							onStarted={(id, question) => {
								setFirstQuestion(question)
								setSelected(id)
							}}
							intro={<ProcessIntro />}
						/>
					) : (
						<ChatThreadView
							key={threadId}
							threadId={threadId}
							draft={draft}
							onDraftConsumed={onDraftConsumed}
							autoSend={firstQuestion}
							onAutoSent={clearFirstQuestion}
						/>
					)}
				</div>
			</SheetContent>
		</Sheet>
	)
}

function ProcessIntro() {
	return (
		<div className="text-sm">
			<p className="mb-3">O assistente já conhece este processo: o documento enviado, os achados da verificação mais recente, com a triagem, e o parecer.</p>
			<p className="mb-2 text-muted-foreground">Ele também consulta a Lei 14.133, os decretos, as IN SEGES, os modelos da AGU e o RADA-e. Experimente:</p>
			<ul className="list-disc space-y-1 pl-5 text-muted-foreground">
				<li>Quais achados impedem a aprovação, e por quê?</li>
				<li>O que a Lei 14.133 exige do estudo técnico preliminar que este documento não tem?</li>
				<li>Reescreva a seção de garantia para atender o achado.</li>
			</ul>
		</div>
	)
}
