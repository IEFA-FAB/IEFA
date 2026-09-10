import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ChatBubble, WarningTriangle } from "iconoir-react"
import { AciNav } from "@/components/aci/AciNav"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/useAuth"
import { listChatSessions } from "@/lib/alpha/chat"
import { saveSessionId } from "@/lib/alpha/chat-session"

export const Route = createFileRoute("/aci/chats")({
	component: ChatsPage,
	head: () => ({ meta: [{ title: "Chats · Plataforma ACI" }] }),
})

/**
 * Os assistentes do Módulo ACI, no estado em que estão.
 *
 * Só o ChatRADA existe (Etapa 1.1). Os outros dois são etapas planejadas do
 * roteiro (1.2 e 1.3) e aparecem como tal — um card que promete um chat que
 * não responde é pior que um card que diz "planejado".
 */
const CHATS = [
	{
		key: "rada",
		title: "ChatRADA",
		stage: "1.1",
		description: "Consulta em linguagem natural ao Regulamento de Administração da Aeronáutica, com citação do dispositivo.",
		status: "disponivel",
	},
	{
		key: "sistemas",
		title: "ChatSistemasSEFA",
		stage: "1.2",
		description: "RAG com memória em grafo sobre os sistemas internos da SEFA — relações entre sistemas e contexto por sessão.",
		status: "planejado",
	},
	{
		key: "licitacoes",
		title: "ChatLicitaçõesSEFA",
		stage: "1.3",
		description: "Busca em acórdãos do TCU, pareceres da CJU e web, com link para o documento original.",
		status: "planejado",
	},
] as const

function formatDate(value: string) {
	return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

function ChatsPage() {
	const { user, session } = useAuth()
	const token = session?.access_token
	const navigate = useNavigate()

	const sessions = useQuery({
		queryKey: ["alpha", "chat", "sessions", user?.id],
		queryFn: () => listChatSessions(token ?? ""),
		enabled: Boolean(token),
	})

	const openSession = (sessionId: string) => {
		if (user) saveSessionId(user.id, sessionId)
		navigate({ to: "/chatRada" })
	}

	return (
		<div>
			<AciNav
				title="Chats"
				subtitle="Os assistentes do Módulo ACI. Conversa é rascunho pessoal: cada analista vê só as próprias — o α não abre a conversa de outro servidor."
			/>

			<div className="grid gap-px border border-border bg-border md:grid-cols-3">
				{CHATS.map((chat) => {
					const available = chat.status === "disponivel"
					const body = (
						<>
							<div className="flex items-center justify-between gap-2">
								<span className="font-mono text-[11px] text-muted-foreground">Etapa {chat.stage}</span>
								<Badge variant={available ? "default" : "outline"} className="text-[10px] uppercase tracking-[0.1em]">
									{available ? "disponível" : "planejado"}
								</Badge>
							</div>
							<h2 className="mt-3 font-semibold text-lg tracking-tight">{chat.title}</h2>
							<p className="mt-1 text-muted-foreground text-sm">{chat.description}</p>
						</>
					)

					return available ? (
						<Link key={chat.key} to="/chatRada" className="block bg-background p-5 transition-colors hover:bg-muted/60">
							{body}
						</Link>
					) : (
						<div key={chat.key} className="bg-background p-5 opacity-70">
							{body}
						</div>
					)
				})}
			</div>

			<section className="mt-10">
				<h2 className="mb-3 text-muted-foreground text-xs uppercase tracking-[0.12em]">Suas conversas recentes no ChatRADA</h2>

				{sessions.isLoading ? <p className="text-muted-foreground text-sm">carregando…</p> : null}
				{sessions.isError ? (
					<p className="flex items-center gap-2 text-sm">
						<WarningTriangle className="size-4" />
						{(sessions.error as Error).message}
					</p>
				) : null}
				{sessions.data?.length === 0 ? (
					<div className="border border-border p-6 text-center">
						<ChatBubble className="mx-auto size-5 text-muted-foreground" />
						<p className="mt-2 text-muted-foreground text-sm">Nenhuma conversa ainda.</p>
					</div>
				) : null}

				{sessions.data && sessions.data.length > 0 ? (
					<ul className="border border-border">
						{sessions.data.map((item) => (
							<li key={item.session_id} className="border-border border-b last:border-b-0">
								<button
									type="button"
									onClick={() => openSession(item.session_id)}
									className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/60"
								>
									<span className="min-w-0 truncate text-sm">{item.title}</span>
									<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
										{item.messages} msg · {formatDate(item.last_message_at)}
									</span>
								</button>
							</li>
						))}
					</ul>
				) : null}
			</section>
		</div>
	)
}
