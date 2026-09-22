import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ChatLines, Plus, WarningTriangle } from "iconoir-react"
import { SectionHeader } from "@/components/alpha/SectionNav"
import { SaveToggle } from "@/components/chat/SaveToggle"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { chatListQueryOptions, useCreateChat } from "@/lib/alpha/chat"
import { describeChatError } from "@/lib/alpha/chat-model"
import { formatDateTime } from "@/lib/alpha/format"

export const Route = createFileRoute("/conversar/")({
	component: ConversasPage,
	head: () => ({ meta: [{ title: "Conversar · Contrate" }] }),
})

function ConversasPage() {
	const { session } = useAuth()
	const threads = useQuery(chatListQueryOptions(session?.access_token, { kind: "avulso" }))
	const create = useCreateChat()
	const navigate = useNavigate()

	const start = () => create.mutate({}, { onSuccess: (thread) => navigate({ to: "/conversar/$threadId", params: { threadId: thread.id } }) })

	return (
		<div>
			<SectionHeader
				eyebrow="Conversar"
				title="Converse com os seus documentos"
				subtitle="Solte um ETP, TR ou edital e pergunte. O assistente lê os arquivos, consulta a Lei 14.133, os decretos, as IN SEGES, os modelos da AGU e o RADA-e, e cita de onde tirou cada resposta."
				actions={
					<Button size="sm" onClick={start} disabled={create.isPending}>
						<Plus />
						{create.isPending ? "abrindo…" : "nova conversa"}
					</Button>
				}
			/>

			{create.isError ? <p className="mb-4 text-sm">{describeChatError(create.error)}</p> : null}
			{threads.isLoading ? <p className="text-muted-foreground text-sm">carregando as conversas…</p> : null}
			{threads.isError ? (
				<p className="flex items-center gap-2 text-sm">
					<WarningTriangle className="size-4" />
					{describeChatError(threads.error)}
				</p>
			) : null}

			{threads.data?.length === 0 ? (
				<div className="border border-border p-8 text-center">
					<ChatLines className="mx-auto mb-3 size-6 text-muted-foreground" />
					<p className="font-medium text-sm">Nenhuma conversa ainda</p>
					<p className="mx-auto mt-1 max-w-md text-muted-foreground text-sm">
						Abra uma conversa e solte o documento. Conversas não salvas são apagadas depois de 180 dias sem uso; salve as que quiser manter.
					</p>
				</div>
			) : null}

			{threads.data && threads.data.length > 0 ? (
				<ul className="border border-border">
					{threads.data.map((thread) => (
						<li key={thread.id} className="flex flex-wrap items-center justify-between gap-3 border-border border-b px-4 py-3 last:border-b-0">
							<div className="min-w-0">
								<Link to="/conversar/$threadId" params={{ threadId: thread.id }} className="block truncate font-medium text-sm hover:underline">
									{thread.title ?? "Conversa sem título"}
								</Link>
								<p className="text-muted-foreground text-xs">última atividade {formatDateTime(thread.last_activity_at)}</p>
							</div>
							<SaveToggle thread={thread} />
						</li>
					))}
				</ul>
			) : null}
		</div>
	)
}
