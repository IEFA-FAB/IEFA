import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { ArrowDown, ChatBubble, Check, Copy, Cpu, Link as LinkIcon, NavArrowLeft, Plus, Refresh, Send, Sparks, User, WarningCircle } from "iconoir-react"
import { useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { authQueryOptions } from "@/auth/service"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import type { ChatAnswer, ChatSessionSummary } from "@/lib/alpha/chat"
import {
	answerText,
	chunkLabel,
	chunkText,
	createChatSession,
	fetchChunk,
	fetchSessionMessages,
	listChatSessions,
	openMessageStream,
	parseSseBuffer,
	sendMessage,
} from "@/lib/alpha/chat"
import { clearSessionId, loadSessionId, saveSessionId } from "@/lib/alpha/chat-session"
import { fetchAlphaHealth } from "@/lib/alpha/client"
import type { ChatMessage, HealthStatus, RemoteMessage, SessionSummary } from "@/types/chat"

/* =========================
   Constantes
========================= */

const USE_STREAM = true

// Query keys centralizados
const QUERY_KEYS = {
	health: ["health"] as const,
	sessions: (userId: string | null) => ["sessions", userId] as const,
	sessionMessages: (userId: string | null, sessionId: string | null) => ["sessionMessages", userId, sessionId] as const,
}

/* =========================
   Utils simples
========================= */

function cn(...xs: Array<string | false | null | undefined>) {
	return xs.filter(Boolean).join(" ")
}

function StatusDot({ status }: { status: HealthStatus }) {
	const color = status === "ok" ? "bg-emerald-500" : status === "loading" ? "bg-amber-400" : "bg-rose-500"
	const pulse = status === "loading" ? "animate-pulse" : ""
	return <span className={`inline-block h-2 w-2 rounded-full ${color} ${pulse}`} aria-hidden="true" />
}

function prettyStatusText(status: HealthStatus) {
	if (status === "ok") return "Online"
	if (status === "loading") return "Conectando…"
	return "Offline"
}

/* === Helpers de referências === */
type ParsedRef = { num: string; title: string; page?: string }

function stripMd(s: string) {
	return s.replace(/\*\*|__/g, "").trim()
}

function extractReferencesMd(text: string): {
	mainText: string
	refs: ParsedRef[]
} {
	const lines = text.split(/\r?\n/)
	let refStart = -1
	for (let i = 0; i < lines.length; i++) {
		const norm = stripMd(lines[i])
			.replace(/\s*:\s*$/, "")
			.trim()
			.toLowerCase()
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
		if (norm === "referencias") {
			refStart = i
			break
		}
	}

	let mainText = text
	let refs: ParsedRef[] = []

	if (refStart >= 0) {
		const before = lines.slice(0, refStart).join("\n").trimEnd()
		const after = lines.slice(refStart + 1)

		const bulletBlock: string[] = []
		let started = false
		for (const l of after) {
			const t = l.trim()
			if (/^[-*]\s+/.test(t)) {
				bulletBlock.push(l)
				started = true
			} else if (t === "" && started) {
				bulletBlock.push(l)
			} else if (started) {
				break
			}
		}

		const pageRe = /p[aá]g\.?\s*([\d]+)\b/i
		const numRe = /\[(\d+)\]/

		refs = bulletBlock
			.map((raw) => raw.replace(/^\s*[-*]\s+/, "").trim())
			.map((l) => {
				const clean = stripMd(l)
				const numMatch = clean.match(numRe)
				const pageMatch = clean.match(pageRe)

				let rest = clean.replace(numRe, "").trim()
				rest = rest.replace(/^[–—-]\s*/, "").trim()
				if (pageMatch && typeof pageMatch.index === "number") {
					rest = rest
						.slice(0, pageMatch.index)
						.trim()
						.replace(/[–—.,;:]\s*$/, "")
				}
				const title = rest

				if (numMatch) {
					return {
						num: String(numMatch[1]),
						title,
						page: pageMatch ? String(pageMatch[1]) : undefined,
					} as ParsedRef
				}
				return null
			})
			.filter(Boolean) as ParsedRef[]

		mainText = before.trim()
	}

	return { mainText, refs }
}
/* === FIM helpers === */

export const Route = createFileRoute("/_public/_en/chatRada")({
	/**
	 * Exige sessão.
	 *
	 * A tela nasceu com um modo anônimo — perguntar sem entrar, histórico só para quem
	 * estivesse logado. Isso não é mais possível: o α autentica TODA rota `/api/v1/*` por
	 * Bearer, então sem sessão não há pergunta a fazer, e a página deslogada só conseguia
	 * mostrar erro. Melhor mandar para o login e voltar do que apresentar um chat que não
	 * responde.
	 *
	 * `redirect: location.href` para o usuário voltar à conversa depois de entrar, e não
	 * cair na home.
	 */
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) throw redirect({ to: "/auth", search: { redirect: location.href } })
	},
	staticData: {
		nav: {
			title: "Chat RADA",
			section: "Facilidades",
			subtitle: "Consulta assistida ao acervo do RADA",
			keywords: ["rada", "chat", "busca", "documentos", "ia"],
			order: 22,
		},
	},
	component: ChatRada,
	head: () => ({
		meta: [{ title: "Chat RADA" }, { name: "description", content: "RAG sobre o RADA" }],
	}),
})

function formatDateShort(iso?: string | null) {
	if (!iso) return ""
	try {
		const d = new Date(iso)
		return d.toLocaleString("pt-BR", {
			day: "2-digit",
			month: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		})
	} catch {
		return ""
	}
}

function sessionTitleLikeChatGPT(s: SessionSummary) {
	// O α passou a derivar o título da pergunta da conversa; sem isto ele era mapeado e
	// descartado, e a barra lateral seguia mostrando só a data.
	const base = s.title?.trim() || `Conversa de ${formatDateShort(s.last_message_at || s.created_at)}`
	return base.length > 60 ? `${base.slice(0, 57)}…` : base
}

/* =========================
   Fetch helper e cliente
========================= */

/**
 * Cliente da conversa.
 *
 * Trocado por inteiro: as chamadas antigas (`/ask`, `/sessions`, header `X-User-Id`)
 * respondem 404 há tempos. O α expõe `/api/v1/sessions*` e autentica por Bearer — o
 * token da sessão do Supabase, passado a cada request porque expira.
 */
function useRagClient(token: string | undefined) {
	return useMemo(
		() => ({
			sessions: async (): Promise<SessionSummary[]> => {
				if (!token) return []
				const list = await listChatSessions(token)
				return list.map(
					(s: ChatSessionSummary) =>
						({
							id: s.session_id,
							title: s.title,
							created_at: s.last_message_at,
							last_message_at: s.last_message_at,
							updated_at: s.last_message_at,
							message_count: s.messages,
						}) as SessionSummary
				)
			},
			sessionMessages: async (sid: string): Promise<RemoteMessage[]> => {
				if (!token) return []
				const messages = await fetchSessionMessages(token, sid)
				// O α devolve o papel do LangChain (`human`/`ai`); a tela fala user/assistant.
				return messages.map((m, i) => ({
					id: `${sid}-${i}`,
					role: m.role === "human" ? "user" : "assistant",
					content: m.content,
					// Sem repassar isto, o painel de fontes do histórico fica sempre vazio: o
					// `select` da query lê `cited_documents` e receberia `undefined` de todas
					// as mensagens, e o efeito que espelha o histórico apagaria até as
					// citações da resposta recém-chegada.
					cited_documents: m.cited_documents ?? [],
					created_at: new Date().toISOString(),
				})) as RemoteMessage[]
			},
			createSession: async (): Promise<string> => {
				if (!token) throw new Error("Sessão expirada — entre novamente.")
				return await createChatSession(token)
			},
			ask: async (sessionId: string, question: string): Promise<ChatAnswer> => {
				if (!token) throw new Error("Sessão expirada — entre novamente.")
				return await sendMessage(token, sessionId, question)
			},
			askStream: async (sessionId: string, question: string, init?: { signal?: AbortSignal }) => {
				if (!token) throw new Error("Sessão expirada — entre novamente.")
				return await openMessageStream(token, sessionId, question, init?.signal)
			},
		}),
		[token]
	)
}

/* =========================
   Queries (TanStack Query)
========================= */

/** Backoff enquanto o α está fora: Fibonacci em ms, teto de 30 s. */
const HEALTH_BACKOFF_MS = [1000, 2000, 3000, 5000, 8000, 13000, 21000, 30000]

/** Ritmo com o α no ar. A sonda toca o banco; de 1 em 1 segundo seria carga sem pergunta. */
const HEALTH_OK_INTERVAL_MS = 30_000

function useHealthQuery() {
	/**
	 * Falhas seguidas, em ref e não em state.
	 *
	 * O contador só decide o próximo intervalo, e mantê-lo em state re-renderizaria
	 * a conversa inteira a cada sonda. O `useEffect` que fazia isso antes dependia
	 * de `isFetched`, que vira `true` na primeira resposta e nunca mais muda: o
	 * contador parava em 1 e o backoff congelava em 2 s — para sempre, no ar ou
	 * fora dele. Eram 30 requisições por minuto, por aba aberta.
	 */
	const consecutiveFailures = useRef(0)

	return useQuery({
		queryKey: QUERY_KEYS.health,
		queryFn: async () => {
			const status = await fetchAlphaHealth()
			consecutiveFailures.current = status === "ok" ? 0 : consecutiveFailures.current + 1
			return status
		},
		refetchInterval: () => {
			const failures = consecutiveFailures.current
			return failures === 0 ? HEALTH_OK_INTERVAL_MS : HEALTH_BACKOFF_MS[Math.min(failures - 1, HEALTH_BACKOFF_MS.length - 1)]
		},
		initialData: "loading" as const,
	})
}

function useSessionsQuery(client: ReturnType<typeof useRagClient>, isLoggedIn: boolean, userId: string | null) {
	return useQuery({
		queryKey: QUERY_KEYS.sessions(userId),
		enabled: isLoggedIn && !!userId,
		queryFn: () => client.sessions(),
	})
}

function useSessionMessagesQuery(client: ReturnType<typeof useRagClient>, isLoggedIn: boolean, userId: string | null, sessionId: string | null) {
	return useQuery({
		queryKey: QUERY_KEYS.sessionMessages(userId, sessionId),
		enabled: isLoggedIn && !!userId && !!sessionId,
		queryFn: () => client.sessionMessages(sessionId as string),
		// O cliente já entrega `{ id, role, content }` normalizado. O `select` anterior lia
		// `content_json`, campo do contrato antigo que ninguém mais produz: toda mensagem
		// restaurada saía vazia, e o `invalidateQueries` disparado após a resposta apagava
		// da tela a resposta recém-exibida.
		select: (data): ChatMessage[] =>
			data.map((m, i) => ({
				id: `${sessionId}-${i}`,
				role: m.role === "user" ? ("user" as const) : ("assistant" as const),
				content: m.content,
				references: [],
				// O α passou a devolver o que foi citado em cada resposta; sem isto, reabrir
				// uma conversa mostrava as respostas sem nenhuma fonte.
				sources: m.cited_documents ?? [],
				createdAt: Date.now(),
			})),
	})
}

/* =========================
   Componentes puros
========================= */

/**
 * Painel de um trecho citado.
 *
 * Busca o chunk sob demanda, ao abrir. Antes a citação era um UUID com um snippet
 * FABRICADO na tela ("Trecho citado do RADA-e (a1b2c3d4)…") — texto que nunca existiu no
 * regulamento, ao lado de uma resposta que se apresenta como fundamentada nele. Agora o
 * que aparece é o trecho que de fato embasou a resposta, com documento e dispositivo.
 */
function CitationPanel({ chunkId, index }: { chunkId: string; index: number }) {
	const { session } = useAuth()
	const [open, setOpen] = useState(false)

	const {
		data: chunk,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["alpha", "chunk", chunkId],
		// Só busca depois de abrir: uma resposta cita cinco trechos, e trazer todos de
		// antemão é peso que quase ninguém abre.
		enabled: open && !!session?.access_token,
		queryFn: () => fetchChunk(session?.access_token as string, chunkId),
		staleTime: Number.POSITIVE_INFINITY, // trecho de norma vigente não muda entre abas
	})

	return (
		<details className="bg-muted/20 border border-border p-2" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
			<summary className="list-none flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
				<Badge variant="secondary" className="h-5 text-[11px]">
					[{index + 1}]
				</Badge>
				<span className="truncate">{chunk ? chunkLabel(chunk) : "Ver o trecho citado"}</span>
			</summary>

			<div className="mt-2 bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
				{isLoading && <p>Carregando o trecho…</p>}
				{isError && <p>Não foi possível carregar este trecho.</p>}
				{chunk && <p className="whitespace-pre-wrap leading-relaxed">{chunkText(chunk)}</p>}
			</div>
		</details>
	)
}

function ReferencesList({ chunkIds }: { chunkIds: string[] }) {
	if (chunkIds.length === 0) return null

	return (
		<details className="mt-2 max-w-[85%] group">
			<summary className="list-none flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none bg-muted/40 border border-border px-3 py-2">
				<LinkIcon className="h-3.5 w-3.5" />
				Trechos citados ({chunkIds.length})
			</summary>
			<div className="mt-1 space-y-1">
				{chunkIds.map((chunkId, index) => (
					<CitationPanel key={chunkId} chunkId={chunkId} index={index} />
				))}
			</div>
		</details>
	)
}

function MessageItem({ m, copiedMsgId, onCopy }: { m: ChatMessage; copiedMsgId: string | null; onCopy: (id: string, text: string) => void }) {
	const isUser = m.role === "user"
	const isError = !!m.error

	const parsed = m.role === "assistant" ? extractReferencesMd(m.content) : null
	const displayMarkdown = parsed?.mainText ?? m.content

	// Pale Brutalism: sharp corners, solid fills, border-first hierarchy
	const bubbleBase = "px-4 py-3 inline-block max-w-[85%]"
	const bubbleUser = "bg-primary text-primary-foreground text-sm leading-relaxed whitespace-pre-wrap border border-primary"
	const bubbleError = "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30 text-sm leading-relaxed"
	const bubbleAssistant = "bg-card border border-border text-foreground"

	return (
		<li className={cn("flex gap-3 group animate-in fade-in slide-in-from-bottom-2 duration-200", isUser && "flex-row-reverse")}>
			{/* Avatar — square, no radius */}
			<div
				className={cn(
					"shrink-0 h-9 w-9 flex items-center justify-center text-sm font-medium border",
					isUser
						? "bg-primary text-primary-foreground border-primary"
						: isError
							? "bg-rose-500 text-white border-rose-500"
							: "bg-muted text-muted-foreground border-border"
				)}
			>
				{isUser ? <User className="h-4 w-4" /> : <Cpu className="h-4 w-4" />}
			</div>

			{/* Content */}
			<div className={cn("flex-1 min-w-0 space-y-1.5", isUser && "flex flex-col items-end")}>
				<div className={cn("flex items-center gap-2", isUser && "flex-row-reverse")}>
					<span className="text-xs font-semibold text-foreground">{isUser ? "Você" : isError ? "Erro" : "Assistente"}</span>
					<span className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
				</div>

				<div className={cn(bubbleBase, isUser && bubbleUser, isError && bubbleError, !isUser && !isError && bubbleAssistant)}>
					{!isUser && !isError ? (
						<ReactMarkdown
							remarkPlugins={[remarkGfm, remarkBreaks]}
							components={{
								// biome-ignore lint/suspicious/noExplicitAny: React ref type mismatch between @types/react versions
								a: (props: any) => <a {...props} className="text-primary hover:underline" target="_blank" rel="noreferrer noopener" />,
								// biome-ignore lint/suspicious/noExplicitAny: React ref type mismatch between @types/react versions
								p: (props: any) => <p {...props} className="mb-3 last:mb-0 text-sm leading-relaxed" />,
								// biome-ignore lint/suspicious/noExplicitAny: React ref type mismatch between @types/react versions
								ul: (props: any) => <ul {...props} className="list-disc pl-5 my-2 text-sm leading-relaxed" />,
								// biome-ignore lint/suspicious/noExplicitAny: React ref type mismatch between @types/react versions
								ol: (props: any) => <ol {...props} className="list-decimal pl-5 my-2 text-sm leading-relaxed" />,
								// biome-ignore lint/suspicious/noExplicitAny: React ref type mismatch between @types/react versions
								code: (props: any) => <code {...props} className="bg-muted/70 px-1.5 py-0.5 border border-border text-xs" />,
							}}
						>
							{displayMarkdown}
						</ReactMarkdown>
					) : (
						<span className="text-sm leading-relaxed">{m.content}</span>
					)}
				</div>

				{/* Referências */}
				{!isUser && !isError && <ReferencesList chunkIds={m.sources ?? []} />}

				{/* Fontes consultadas */}

				{/* Copiar */}
				<Button
					className={cn(
						"opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1",
						isUser && "ml-auto"
					)}
					variant="ghost"
					onClick={() => onCopy(m.id, m.content)}
					aria-label="Copiar mensagem"
					title="Copiar mensagem"
				>
					{copiedMsgId === m.id ? (
						<>
							<Check className="h-3.5 w-3.5 text-emerald-600" />
							<span className="font-medium">Copiado!</span>
						</>
					) : (
						<>
							<Copy className="h-3.5 w-3.5" />
							Copiar
						</>
					)}
				</Button>
			</div>
		</li>
	)
}

/* =========================
   Componente principal
========================= */

function ChatRada() {
	const { user, session } = useAuth()
	const userId = user?.id ?? null
	const isLoggedIn = !!userId
	// O α valida o JWT a cada request; o token vem da sessão corrente, nunca memoizado.
	const client = useRagClient(session?.access_token)
	const queryClient = useQueryClient()

	const healthQuery = useHealthQuery()
	const health: HealthStatus = healthQuery.data ?? "loading"
	const checkHealth = () => healthQuery.refetch()

	const { data: sessions = [] } = useSessionsQuery(client, isLoggedIn, userId)

	const [input, setInput] = useState("")
	const [sending, setSending] = useState(false)
	const [messages, setMessages] = useState<ChatMessage[]>([])
	const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
	const [isAtBottom, setIsAtBottom] = useState(true)
	const [sessionId, setSessionId] = useState<string | null>(null)
	// Mobile: 'list' shows session panel full-screen; 'chat' shows active chat full-screen
	const [mobileView, setMobileView] = useState<"list" | "chat">("list")

	const scrollRef = useRef<HTMLDivElement>(null)
	const editorRef = useRef<HTMLTextAreaElement>(null)
	const sseAbortRef = useRef<AbortController | null>(null)

	// Sair da página no meio de uma resposta deixava o leitor do stream girando por até 60s,
	// chamando `setMessages` e `invalidateQueries` num componente desmontado. O efeito de
	// limpeza que fazia isto foi perdido na reescrita do cliente.
	useEffect(() => {
		return () => {
			sseAbortRef.current?.abort()
			sseAbortRef.current = null
		}
	}, [])

	// Login/sessionId sync
	useEffect(() => {
		if (isLoggedIn && userId) {
			const sid = loadSessionId(userId)
			if (sid) setSessionId(sid)
		} else {
			setSessionId(null)
			if (userId) clearSessionId(userId)
		}
		// `userId` entra na lista: a chave da sessão passou a ser por usuário, então trocar
		// de conta precisa recarregar a sessão da conta nova em vez de manter a anterior.
	}, [isLoggedIn, userId])

	// Load history when sessionId changes
	const { data: sessionMessages = [] } = useSessionMessagesQuery(client, isLoggedIn, userId, sessionId)

	useEffect(() => {
		if (!isLoggedIn || !userId || !sessionId) return
		// Lista vazia não substitui a conversa em tela: sessão recém-criada ainda não tem
		// estado no checkpointer, e espelhar o vazio apagava a pergunta do usuário no meio
		// do stream.
		if (sessionMessages.length === 0) return
		setMessages(sessionMessages)
	}, [isLoggedIn, userId, sessionId, sessionMessages])

	const scrollToBottom = () => {
		const el = scrollRef.current
		if (!el) return
		el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
	}

	useEffect(() => {
		if (isAtBottom && messages.length > 0) {
			scrollToBottom()
		}
		// biome-ignore lint/correctness/useExhaustiveDependencies: React Compiler handles stability
	}, [messages, isAtBottom, scrollToBottom])

	const onScrollMessages = () => {
		const el = scrollRef.current
		if (!el) return
		const threshold = 48
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
		setIsAtBottom(atBottom)
	}

	const startNewSession = () => {
		if (isLoggedIn) {
			clearSessionId(userId)
			setSessionId(null)
		}
		setMessages([])
		setMobileView("chat")
	}

	const selectSession = (sid: string) => {
		if (!isLoggedIn) return
		if (sid === sessionId) {
			setMobileView("chat")
			return
		}
		saveSessionId(userId, sid)
		setSessionId(sid)
		setMessages([])
		setMobileView("chat")
	}

	/**
	 * Garante uma sessão antes de perguntar.
	 *
	 * O α cunha o UUID em `POST /api/v1/sessions` e passa a reconhecê-lo pelo `query_log`.
	 * Antes a tela mandava a pergunta solta para `/ask` e esperava a sessão de volta.
	 */
	const ensureSession = async (): Promise<string> => {
		if (sessionId) return sessionId
		const sid = await client.createSession()
		if (userId) saveSessionId(userId, sid)
		return sid
	}

	const onSubmit = async () => {
		const question = input.trim()
		if (!question || sending) return

		if (sseAbortRef.current) {
			sseAbortRef.current.abort()
			sseAbortRef.current = null
		}

		const userMsg: ChatMessage = {
			id: crypto?.randomUUID?.() ?? String(Date.now()),
			role: "user",
			content: question,
			createdAt: Date.now(),
		}
		setMessages((prev) => [...prev, userMsg])
		setInput("")
		setSending(true)

		const assistantId = crypto?.randomUUID?.() ?? `${Date.now()}-assistant`

		try {
			if (USE_STREAM) {
				const ctrl = new AbortController()
				sseAbortRef.current = ctrl

				const sid = await ensureSession()
				const res = await client.askStream(sid, question, { signal: ctrl.signal })
				if (!res.body) {
					const errText = await res.text().catch(() => "Erro desconhecido")
					throw new Error(errText)
				}

				const reader = res.body.getReader()
				const decoder = new TextDecoder()
				let buffer = ""
				let hasInserted = false

				const applyComplete = async (payload: ChatAnswer) => {
					const text = answerText(payload)

					if (!hasInserted) {
						hasInserted = true
						setSending(false)
						setMessages((prev) => [
							...prev,
							{ id: assistantId, role: "assistant", content: text, references: [], sources: payload.cited_documents, createdAt: Date.now() } as ChatMessage,
						])
					} else {
						setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: text, sources: payload.cited_documents } : m)))
					}

					if (isLoggedIn && userId && payload.session_id) {
						setSessionId(payload.session_id)
						saveSessionId(userId, payload.session_id)
						// Só a lista de sessões. Invalidar o HISTÓRICO aqui refaz a busca e o
						// efeito que espelha `sessionMessages` sobrescreve a conversa em tela
						// pela versão do servidor — apagando a resposta recém-exibida.
						await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions(userId) })
					}
				}

				while (true) {
					const { done, value } = await reader.read()
					if (done) break
					buffer += decoder.decode(value, { stream: true })

					// O α manda `status` a cada nó do grafo e `complete` no fim; o parser
					// devolve o nome, que é justamente o que a versão anterior descartava.
					const { events, rest } = parseSseBuffer(buffer)
					buffer = rest
					for (const evt of events) {
						if (evt.event === "complete") await applyComplete(JSON.parse(evt.data) as ChatAnswer)
						else if (evt.event === "error") throw new Error("A consulta falhou no servidor.")
					}
				}
				buffer += decoder.decode()
			} else {
				const sid = await ensureSession()
				const data = await client.ask(sid, question)

				setSending(false)
				const assistantMsg: ChatMessage = {
					id: crypto?.randomUUID?.() ?? String(Date.now()),
					role: "assistant",
					content: answerText(data),
					sources: data.cited_documents,
					references: [],
					createdAt: Date.now(),
				}
				setMessages((prev) => [...prev, assistantMsg])

				if (isLoggedIn && userId && data?.session_id) {
					setSessionId(data.session_id)
					saveSessionId(userId, data.session_id)
					await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions(userId) })
				}
			}
		} catch (err: unknown) {
			if (err instanceof Error && err.name === "AbortError") {
				return
			}
			setSending(false)
			const assistantErr: ChatMessage = {
				id: crypto?.randomUUID?.() ?? String(Date.now()),
				role: "assistant",
				content: "Ocorreu um erro ao consultar o serviço. Tente novamente em instantes.",
				error: true,
				createdAt: Date.now(),
			}
			setMessages((prev) => [...prev, assistantErr])
		} finally {
			setSending(false)
			if (sseAbortRef.current) {
				sseAbortRef.current = null
			}
		}
	}

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault()
			onSubmit()
		}
	}

	const copyMessage = async (id: string, text: string) => {
		try {
			await navigator.clipboard.writeText(text)
			setCopiedMsgId(id)
			setTimeout(() => setCopiedMsgId(null), 1500)
		} catch {
			// noop
		}
	}

	return (
		// Fixed full-screen below the sticky nav header (h-14 = 3.5rem).
		// Escapes the AppLayout container so the chat fills the full viewport width.
		<div className="fixed inset-x-0 top-14 bottom-0 flex overflow-hidden bg-background text-foreground border-t border-border z-10">
			{/* ── SIDEBAR: session list ── */}
			<aside
				className={cn(
					"flex flex-col bg-background border-r border-border shrink-0",
					// Mobile: full-screen when on list view, hidden when in chat
					// Desktop: always visible at fixed width
					mobileView === "list" ? "flex w-full md:w-72" : "hidden md:flex md:w-72"
				)}
			>
				{/* Header */}
				<div className="shrink-0 h-14 border-b border-border px-4 flex items-center justify-between">
					<div className="flex items-center gap-2.5">
						<Sparks className="h-4 w-4 text-primary" aria-hidden="true" />
						<span className="text-sm font-semibold tracking-tight">Chat RADA</span>
					</div>
					<div className="flex items-center gap-1.5">
						<StatusDot status={health} />
						<span className="text-xs text-muted-foreground">{prettyStatusText(health)}</span>
					</div>
				</div>

				{/* New conversation */}
				<div className="shrink-0 p-3 border-b border-border">
					<Button
						onClick={startNewSession}
						variant="default"
						className="w-full justify-start gap-2 font-medium"
						title={isLoggedIn ? "Iniciar nova sessão" : "Nova conversa (sem histórico)"}
					>
						<Plus className="h-4 w-4" />
						Nova conversa
					</Button>

					{!isLoggedIn && (
						<div className="mt-2 flex items-start gap-2 border border-amber-500/30 bg-amber-500/5 px-3 py-2">
							<WarningCircle className="mt-0.5 h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
							<span className="text-[11px] text-muted-foreground">Não logado. Histórico desativado.</span>
						</div>
					)}
				</div>

				{/* Session list */}
				<div className="flex-1 overflow-y-auto">
					{!isLoggedIn ? (
						<div className="py-10 px-6 text-center">
							<p className="text-xs text-muted-foreground leading-relaxed">Faça login para ver e manter o histórico das suas conversas.</p>
						</div>
					) : sessions.length === 0 ? (
						<div className="py-10 px-6 text-center">
							<p className="text-xs text-muted-foreground">Nenhuma conversa. Inicie um novo bate-papo.</p>
						</div>
					) : (
						sessions.map((s) => {
							const active = s.id === sessionId
							return (
								<button
									key={s.id}
									type="button"
									onClick={() => selectSession(s.id)}
									className={cn(
										"w-full flex items-center gap-3 px-3 py-3 border-b border-border/50 text-left transition-colors group/row",
										active ? "bg-primary/10" : "hover:bg-muted/50"
									)}
									title={sessionTitleLikeChatGPT(s)}
									aria-label={`Abrir sessão ${sessionTitleLikeChatGPT(s)}`}
									aria-current={active ? "true" : undefined}
								>
									{/* Avatar square */}
									<div
										className={cn(
											"shrink-0 h-9 w-9 flex items-center justify-center border",
											active ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"
										)}
									>
										<ChatBubble className="h-4 w-4" aria-hidden="true" />
									</div>

									{/* Meta */}
									<div className="flex-1 min-w-0">
										<p className={cn("text-sm font-medium truncate", active ? "text-primary" : "text-foreground")}>{sessionTitleLikeChatGPT(s)}</p>
										<p className="text-[11px] text-muted-foreground mt-0.5">{formatDateShort(s.last_message_at || s.created_at)}</p>
									</div>
								</button>
							)
						})
					)}
				</div>

				{/* Footer note */}
				<div className="shrink-0 border-t border-border px-4 py-3">
					<div className="flex items-start gap-2 text-[11px] text-muted-foreground">
						<WarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
						<span>{isLoggedIn ? "Conversas ficam salvas por 7 dias." : "Entre para ativar o histórico permanente."}</span>
					</div>
				</div>
			</aside>

			{/* ── CHAT PANEL ── */}
			<main className={cn("flex flex-col bg-background overflow-hidden min-w-0", mobileView === "chat" ? "flex flex-1" : "hidden md:flex md:flex-1")}>
				{/* Chat header */}
				<header className="shrink-0 h-14 border-b border-border px-4 flex items-center gap-3">
					{/* Back button — mobile only */}
					<button
						type="button"
						className="md:hidden -ml-1 h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors"
						onClick={() => setMobileView("list")}
						aria-label="Voltar para conversas"
					>
						<NavArrowLeft className="h-5 w-5" aria-hidden="true" />
					</button>

					<div className="shrink-0 h-8 w-8 bg-primary flex items-center justify-center" aria-hidden="true">
						<Sparks className="h-4 w-4 text-primary-foreground" />
					</div>

					<div className="flex-1 min-w-0">
						<h1 className="text-sm font-semibold leading-tight">Chat RADA</h1>
						<p className="text-[11px] text-muted-foreground leading-tight hidden sm:block">Assistente sobre o Regulamento de Administração</p>
					</div>

					<div className="flex items-center gap-1.5">
						<div className="hidden sm:flex items-center gap-1.5 border border-border px-2 py-1 text-xs text-muted-foreground">
							<StatusDot status={health} />
							<span>{prettyStatusText(health)}</span>
						</div>

						{isLoggedIn && sessionId && (
							<span className="hidden lg:inline border border-border px-2 py-1 text-[11px] text-muted-foreground font-mono">{sessionId.slice(0, 8)}…</span>
						)}

						<Button variant="ghost" size="sm" onClick={checkHealth} className="h-8 w-8 p-0" title="Atualizar status" aria-label="Atualizar status">
							<Refresh className="h-4 w-4" />
						</Button>
					</div>
				</header>

				{/* Messages area */}
				<div className="flex-1 overflow-hidden flex flex-col relative">
					{messages.length === 0 ? (
						// Empty state
						<div className="flex-1 flex items-center justify-center p-8">
							<div className="text-center max-w-sm space-y-5 w-full">
								<div className="mx-auto h-16 w-16 border border-border bg-muted flex items-center justify-center" aria-hidden="true">
									<Sparks className="h-7 w-7 text-muted-foreground" />
								</div>
								<div>
									<p className="text-base font-semibold tracking-tight">Chat RADA</p>
									<p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
										{isLoggedIn && sessions.length > 0
											? "Selecione uma conversa ou inicie uma nova."
											: "Faça sua pergunta sobre o Regulamento de Administração da Aeronáutica."}
									</p>
								</div>
								<div className="border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-left">
									<p className="text-xs font-semibold text-amber-900 dark:text-amber-100 mb-1">Importante</p>
									<p className="text-xs text-amber-800/80 dark:text-amber-200/70 leading-relaxed">
										{isLoggedIn
											? 'O histórico desta conversa é salvo automaticamente por 7 dias. Use "Nova conversa" para mudar de assunto.'
											: "Você não está logado. Faça login para ativar o histórico de conversas."}
									</p>
								</div>
							</div>
						</div>
					) : (
						<>
							<div ref={scrollRef} onScroll={onScrollMessages} className="flex-1 overflow-y-auto">
								<div className="px-4 md:px-6 py-6 max-w-3xl mx-auto">
									<ul className="space-y-5" aria-label="Mensagens">
										{messages.map((m) => (
											<MessageItem key={m.id} m={m} copiedMsgId={copiedMsgId} onCopy={copyMessage} />
										))}

										{/* Sending indicator */}
										{sending && (
											<li className="flex gap-3 animate-in fade-in duration-200" aria-label="Processando resposta">
												<div className="shrink-0 h-9 w-9 flex items-center justify-center border border-border bg-muted">
													<Cpu className="h-4 w-4 animate-pulse text-muted-foreground" aria-hidden="true" />
												</div>
												<div className="flex items-center gap-3 px-4 py-3 bg-card border border-border">
													<div className="flex gap-1" aria-hidden="true">
														<span className="h-2 w-2 bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
														<span className="h-2 w-2 bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
														<span className="h-2 w-2 bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
													</div>
													<span className="text-xs text-muted-foreground">Processando…</span>
												</div>
											</li>
										)}
									</ul>
								</div>
							</div>

							{/* Scroll to bottom */}
							{!isAtBottom && (
								<div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
									<Button onClick={scrollToBottom} variant="outline" size="sm" className="flex items-center gap-2 text-xs border border-border bg-background">
										<ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
										Novas mensagens
									</Button>
								</div>
							)}
						</>
					)}
				</div>

				{/* Input bar */}
				<div className="shrink-0 border-t border-border bg-background px-4 md:px-6 py-4">
					<div className="max-w-3xl mx-auto">
						<div className="flex items-end gap-2">
							<div className="flex-1">
								<textarea
									ref={editorRef}
									value={input}
									onChange={(e) => setInput(e.target.value)}
									onKeyDown={onKeyDown}
									rows={1}
									placeholder="Escreva sua pergunta sobre o RADA…"
									className="w-full resize-none border border-border bg-background px-4 py-3 text-sm
                    placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-ring focus-visible:border-ring transition-colors"
									aria-label="Caixa de texto da mensagem"
								/>
							</div>
							<Button
								onClick={onSubmit}
								disabled={sending || !input.trim() || health !== "ok"}
								size="sm"
								className="shrink-0 h-11 w-11 p-0"
								title={health !== "ok" ? "Serviço indisponível" : "Enviar"}
								aria-label="Enviar"
							>
								<Send className="h-4 w-4" />
							</Button>
						</div>

						<div className="mt-2 flex items-center justify-between text-xs">
							<span className="text-muted-foreground">
								<kbd className="px-1.5 py-0.5 border border-border font-mono text-[10px] bg-muted">Enter</kbd> para enviar ·{" "}
								<kbd className="px-1.5 py-0.5 border border-border font-mono text-[10px] bg-muted">Shift + Enter</kbd> para quebra
							</span>
							{health !== "ok" && (
								<span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1.5">
									<WarningCircle className="h-3.5 w-3.5" aria-hidden="true" />
									Serviço indisponível
								</span>
							)}
						</div>
					</div>
				</div>
			</main>
		</div>
	)
}
