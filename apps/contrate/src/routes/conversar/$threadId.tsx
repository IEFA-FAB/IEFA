import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { NavArrowLeft, Trash } from "iconoir-react"
import { AttachmentDropzone } from "@/components/chat/AttachmentDropzone"
import { ChatThreadView } from "@/components/chat/ChatThreadView"
import { SaveToggle } from "@/components/chat/SaveToggle"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { chatThreadQueryOptions, useDeleteChat } from "@/lib/alpha/chat"
import { describeChatError } from "@/lib/alpha/chat-model"

export const Route = createFileRoute("/conversar/$threadId")({
	component: ConversaPage,
	head: () => ({ meta: [{ title: "Conversa · Contrate" }] }),
})

function ConversaPage() {
	const { threadId } = Route.useParams()
	const { session } = useAuth()
	const thread = useQuery(chatThreadQueryOptions(session?.access_token, threadId))
	const remove = useDeleteChat()
	const navigate = useNavigate()

	const destroy = () => {
		if (!window.confirm("Apagar esta conversa e os arquivos dela? Não há como desfazer.")) return
		remove.mutate(threadId, { onSuccess: () => navigate({ to: "/conversar" }) })
	}

	return (
		<div className="-my-8 flex h-[calc(100dvh-4rem)] flex-col border-border border-x md:-my-10">
			<div className="flex flex-wrap items-center justify-between gap-2 border-border border-b px-4 py-3">
				<div className="flex min-w-0 items-center gap-2">
					<Button size="icon-sm" variant="ghost" render={<Link to="/conversar" />} nativeButton={false} aria-label="Voltar às conversas">
						<NavArrowLeft />
					</Button>
					<h1 className="truncate font-semibold text-lg tracking-tight">{thread.data?.title ?? "Nova conversa"}</h1>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{thread.data ? <SaveToggle thread={thread.data} /> : null}
					<Button size="xs" variant="ghost" onClick={destroy} disabled={remove.isPending}>
						<Trash />
						apagar
					</Button>
				</div>
			</div>
			{remove.isError ? <p className="px-4 py-2 text-sm">{describeChatError(remove.error)}</p> : null}

			<div className="min-h-0 flex-1">
				<ChatThreadView
					threadId={threadId}
					header={thread.data ? <AttachmentDropzone threadId={threadId} attachments={thread.data.attachments} max={thread.data.max_attachments} /> : null}
					emptyState={<LooseIntro hasFiles={(thread.data?.attachments.length ?? 0) > 0} />}
				/>
			</div>
		</div>
	)
}

function LooseIntro({ hasFiles }: { hasFiles: boolean }) {
	return (
		<div className="max-w-xl text-sm">
			<p className="mb-3">
				{hasFiles
					? "Os arquivos estão prontos. Pergunte o que quiser sobre eles."
					: "Solte o documento acima e pergunte. Sem arquivo, o assistente responde só com a norma."}
			</p>
			<p className="mb-2 text-muted-foreground">
				O assistente consulta os seus arquivos, a Lei 14.133, os decretos, as IN SEGES, os modelos da AGU e o RADA-e. Experimente:
			</p>
			<ul className="list-disc space-y-1 pl-5 text-muted-foreground">
				<li>O que falta neste TR para atender a Lei 14.133?</li>
				<li>Compare a justificativa deste ETP com o modelo da AGU.</li>
				<li>Reescreva a cláusula de pagamento com prazo e forma de liquidação.</li>
			</ul>
		</div>
	)
}
