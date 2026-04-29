import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ArrowDown, ChatBubble, Check, Copy, Cpu, Link as LinkIcon, NavArrowLeft, Plus, Refresh, Send, Sparks, Trash, User, WarningCircle } from "iconoir-react"
import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import type { AskReference, AskResponse, ChatMessage, HealthStatus, RemoteMessage, SessionSummary } from "@/types/chat"

/* =========================
   Constantes
========================= */

const API_BASE = "https://iefa-rag.fly.dev"
const USE_STREAM = true

// localStorage keys (somente quando logado)
const LS_SESSION_ID = "rada_session_id"

// Query keys centralizados
const QUERY_KEYS = {
	health: ["health"] as const,
	sessions: (userId: string | null) => ["sessions", userId] as const,
	sessionMessages: (userId: string | null, sessionId: string | null) => ["sessionMessages", userId, sessionId] as const,
}

/* =========================
   Utils simples
========================= */

function loadSessionId(): string | null {
	try {
		return localStorage.getItem(LS_SESSION_ID)
	} catch {
		return null
	}
}
function saveSessionId(id: string) {
	try {
		localStorage.setItem(LS_SESSION_ID, id)
	} catch {
		// noop
	}
}
function clearSessionId() {
	try {
		localStorage.removeItem(LS_SESSION_ID)
	} catch {
		// noop
	}
}

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

function isLikelyUrl(s: string) {
	try {
		const u = new URL(s)
		return !!u.protocol && !!u.host
	} catch {
		return false
	}
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

type ContentJson = {
	answer?: string
	question?: string
	content?: string
	references?: AskReference[]
	sources?: string[]
}

function parseContentJson(input: unknown): ContentJson {
	if (!input) return {}
	if (typeof input === "string") {
		try {
			return JSON.parse(input) as ContentJson
		} catch {
			return {}
		}
	}
	if (typeof input === "object") return input as ContentJson
	return {}
}

export const Route = createFileRoute("/_public/chatRada")({
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
	const base = `Conversa de ${formatDateShort(s.last_message_at || s.created_at)}`
	return base.length > 60 ? `${base.slice(0, 57)}…` : base
}

/* =========================
   Fetch helper e cliente
========================= */

async function ragFetch(path: string, init: RequestInit & { jsonBody?: unknown } = {}, opts?: { userId?: string | null; withAuth?: boolean }) {
	const url = `${API_BASE}${path}`
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(init.headers as Record<string, string>),
	}
	if (opts?.withAuth && opts.userId) headers["X-User-Id"] = opts.userId

	const res = await fetch(url, {
		...init,
		headers,
		credentials: opts?.withAuth ? "include" : "omit",
		body: init.jsonBody ? JSON.stringify(init.jsonBody) : init.body,
	})
	return res
}

function useRagClient(userId: string | null) {
	const withAuth = !!userId

	return {
		sessions: async () => {
			const res = await ragFetch("/sessions", { method: "GET" }, { withAuth, userId })
			if (!res.ok) throw new Error("Falha ao buscar sessões")
			const data: SessionSummary[] = await res.json()
			return data
		},
		sessionMessages: async (sid: string) => {
			const res = await ragFetch(`/sessions/${sid}/messages`, { method: "GET" }, { withAuth, userId })
			if (!res.ok) throw new Error("Falha ao buscar mensagens")
			const data: RemoteMessage[] = await res.json()
			return data
		},
		deleteSession: async (sid: string) => {
			const res = await ragFetch(`/sessions/${sid}`, { method: "DELETE" }, { withAuth, userId })
			if (!res.ok) throw new Error("Falha ao apagar sessão")
			return true
		},
		ask: async (payload: unknown) => {
			const res = await ragFetch("/ask", { method: "POST", jsonBody: payload }, { withAuth, userId })
			if (!res.ok) {
				const errText = await res.text().catch(() => "Erro desconhecido")
				throw new Error(errText || `HTTP ${res.status}`)
			}
			const data: AskResponse = await res.json()
			return data
		},
		askStream: async (payload: unknown, init?: { signal?: AbortSignal }) => {
			const res = await ragFetch(
				"/ask/stream",
				{
					method: "POST",
					jsonBody: payload,
					headers: { Accept: "text/event-stream" },
					signal: init?.signal,
				},
				{ withAuth, userId }
			)
			if (!res.ok) {
				const errText = await res.text().catch(() => "Erro desconhecido")
				throw new Error(errText || `HTTP ${res.status}`)
			}
			return res
		},
	}
}

/* =========================
   Queries (TanStack Query)
========================= */

function useHealthQuery() {
	const [retryCount, setRetryCount] = useState(0)

	// Fibonacci sequence capped at 30s: 1, 2, 3, 5, 8, 13, 21, 30
	const fibIntervals = [1000, 2000, 3000, 5000, 8000, 13000, 21000, 30000]
	const currentInterval = fibIntervals[Math.min(retryCount, fibIntervals.length - 1)]

	const query = useQuery({
		queryKey: QUERY_KEYS.health,
		queryFn: async () => {
			try {
				const res = await fetch(`${API_BASE}/health`)
				const data = await res.json().catch(() => ({}))
				return res.ok && data?.status === "ok" ? ("ok" as const) : ("error" as const)
			} catch {
				return "error" as const
			}
		},
		refetchInterval: currentInterval,
		initialData: "loading" as const,
	})

	useEffect(() => {
		if (query.isFetched) {
			setRetryCount((c) => c + 1)
		}
		// Intentionally tracks only isFetched to increment on each fetch result
	}, [query.isFetched])

	return query
}

function useSessionsQuery(client: ReturnType<typeof useRagClient>, isLoggedIn: boolean, userId: string | null) {
	return useQuery({
		queryKey: QUERY_KEYS.sessions(userId),
		enabled: isLoggedIn && !!userId,
		queryFn: () => client.sessions(),
		select: (data) => {
			return [...data].sort((a, b) => {
				const ad = new Date(a.last_message_at || a.created_at).getTime()
				const bd = new Date(b.last_message_at || b.created_at).getTime()
				return bd - ad
			})
		},
		staleTime: 30_000,
		gcTime: 5 * 60_000,
	})
}

function useSessionMessagesQuery(client: ReturnType<typeof useRagClient>, isLoggedIn: boolean, userId: string | null, sessionId: string | null) {
	return useQuery({
		queryKey: QUERY_KEYS.sessionMessages(userId, sessionId),
		enabled: isLoggedIn && !!userId && !!sessionId,
		queryFn: () => client.sessionMessages(sessionId as string),
		select: (data) => {
			return data.map((r, i) => {
				const role = r.role === "system" ? ("assistant" as const) : (r.role as "user" | "assistant")
				const cj = parseContentJson(r.content_json)
				const content = role === "assistant" ? String(cj?.answer ?? "") : role === "user" ? String(cj?.question ?? "") : String(cj?.content ?? "")

				const references: AskReference[] = Array.isArray(cj?.references) ? cj.references : []
				const sources: string[] = Array.isArray(cj?.sources) ? cj.sources : []

				return {
					id: `${sessionId}-${i}`,
					role,
					content,
					references,
					sources,
					createdAt: new Date(r.created_at).getTime(),
				} as ChatMessage
			})
		},
		staleTime: 10_000,
		gcTime: 5 * 60_000,
	})
}

function useDeleteSessionMutation(client: ReturnType<typeof useRagClient>, userId: string | null, _sessionId: string | null) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (sid: string) => client.deleteSession(sid),
		onMutate: async (sid) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEYS.sessions(userId) })
			const previousSessions = queryClient.getQueryData<SessionSummary[]>(QUERY_KEYS.sessions(userId))
			queryClient.setQueryData<SessionSummary[]>(QUERY_KEYS.sessions(userId), (old) => (old ? old.filter((s) => s.id !== sid) : []))
			return { previousSessions }
		},
		onError: (_err, _sid, context) => {
			if (context?.previousSessions) {
				queryClient.setQueryData(QUERY_KEYS.sessions(userId), context.previousSessions)
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions(userId) })
		},
	})
}

/* =========================
   Componentes puros
========================= */

function ReferencesList({ id, references }: { id: string; references: AskReference[] }) {
	return (
		<details className="mt-2 max-w-[85%] group">
			<summary className="list-none flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none bg-muted/40 border border-border px-3 py-2">
				<LinkIcon className="h-3.5 w-3.5" />
				Referências ({references.length})
			</summary>
			<div className="mt-1 space-y-1">
				{references.map((ref) => {
					const refKey = `${ref.doc_id ?? "d"}-${ref.source}-${ref.n}-${ref.page ?? "p"}`
					return (
						<details key={`${id}-ref-${refKey}`} className="bg-muted/20 border border-border p-2">
							<summary className="list-none flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
								<Badge variant="secondary" className="h-5 text-[11px]">
									[{ref.n}]
								</Badge>
								<span className="text-xs font-medium truncate">{ref.source}</span>
								{ref.page != null && <span className="text-xs text-muted-foreground">pág. {ref.page}</span>}
							</summary>
							{ref.snippet && (
								<div className="mt-2 bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
									<p className="italic">
										{ref.snippet.substring(0, 200)}
										{ref.snippet.length > 200 ? "..." : ""}
									</p>
								</div>
							)}
						</details>
					)
				})}
			</div>
		</details>
	)
}

function SourcesList({ id, sources }: { id: string; sources: string[] }) {
	return (
		<details className="mt-2 max-w-[85%] group">
			<summary className="list-none flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none bg-muted/40 border border-border px-3 py-2">
				<LinkIcon className="h-3.5 w-3.5" />
				Fontes consultadas ({sources.length})
			</summary>
			<ul className="mt-1 space-y-1">
				{sources.map((s) => (
					<li key={`${id}-src-${s}`} className="flex items-start gap-2 bg-muted/20 border border-border p-2">
						<span className="text-xs text-muted-foreground mt-0.5">•</span>
						{isLikelyUrl(s) ? (
							<a className="text-xs text-primary hover:underline break-all transition-colors" href={s} target="_blank" rel="noreferrer noopener">
								{s}
							</a>
						) : (
							<code className="text-xs bg-muted/70 px-2 py-1 border border-border">{s}</code>
						)}
					</li>
				))}
			</ul>
		</details>
	)
}

function MessageItem({ m, copiedMsgId, onCopy }: { m: ChatMessage; copiedMsgId: string | null; onCopy: (id: string, text: string) => void }) {
	const isUser = m.role === "user"
	const isError = !!m.error

	const parsed = m.role === "assistant" ? extractReferencesMd(m.content) : null
	const displayMarkdown = parsed?.mainText ?? m.content
	const hasReferences = !!(m.references && m.references.length > 0)

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
				{!isUser && !isError && hasReferences && <ReferencesList id={m.id} references={m.references as NonNullable<typeof m.references>} />}

				{/* Fontes consultadas */}
				{!isUser && !isError && m.sources && m.sources.length > 0 && <SourcesList id={m.id} sources={m.sources} />}

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
	const { user } = useAuth()
	const userId = user?.id ?? null
	const isLoggedIn = !!userId

	const client = useRagClient(userId)
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

	const deleteSessionMutation = useDeleteSessionMutation(client, userId, sessionId)

	// Login/sessionId sync
	useEffect(() => {
		if (isLoggedIn) {
			const sid = loadSessionId()
			if (sid) setSessionId(sid)
		} else {
			setSessionId(null)
			clearSessionId()
		}
	}, [isLoggedIn])

	// Load history when sessionId changes
	const { data: sessionMessages = [] } = useSessionMessagesQuery(client, isLoggedIn, userId, sessionId)

	useEffect(() => {
		if (!isLoggedIn || !userId || !sessionId) return
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
			clearSessionId()
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
		saveSessionId(sid)
		setSessionId(sid)
		setMessages([])
		setMobileView("chat")
	}

	const deleteSession = async (sid: string, e?: React.MouseEvent<HTMLButtonElement>) => {
		if (!isLoggedIn || !userId) return
		e?.stopPropagation()
		try {
			await deleteSessionMutation.mutateAsync(sid)
			if (sessionId === sid) {
				startNewSession()
			}
		} catch {
			// Erro já tratado pela mutation
		}
	}

	// Cancel SSE on unmount
	useEffect(() => {
		return () => {
			if (sseAbortRef.current) {
				sseAbortRef.current.abort()
				sseAbortRef.current = null
			}
		}
	}, [])

	const buildPayload = (question: string) => {
		const base: Record<string, string> = { question }
		if (isLoggedIn && sessionId) base.session_id = sessionId
		return base
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

				const res = await client.askStream(buildPayload(question), { signal: ctrl.signal })
				if (!res.body) {
					const errText = await res.text().catch(() => "Erro desconhecido")
					throw new Error(errText)
				}

				const reader = res.body.getReader()
				const decoder = new TextDecoder()
				let buffer = ""
				let hasInserted = false

				const applyDelta = (delta: string) => {
					setMessages((prev) => {
						if (!hasInserted) {
							hasInserted = true
							setSending(false)
							return [
								...prev,
								{
									id: assistantId,
									role: "assistant",
									content: delta,
									sources: [],
									references: [],
									createdAt: Date.now(),
								} as ChatMessage,
							]
						}
						return prev.map((m) => (m.id === assistantId ? { ...m, content: (m.content || "") + delta } : m))
					})
				}

				const applyFinal = async (finalPayload: Record<string, unknown>) => {
					const answer = String(finalPayload.answer ?? "")
					const refs = Array.isArray(finalPayload.references) ? (finalPayload.references as AskReference[]) : []
					const srcs = Array.isArray(finalPayload.sources) ? (finalPayload.sources as string[]) : []
					const sid = String(finalPayload.session_id || finalPayload.sessionId || "")

					if (!hasInserted) {
						hasInserted = true
						setSending(false)
						setMessages((prev) => [
							...prev,
							{
								id: assistantId,
								role: "assistant",
								content: answer,
								references: refs,
								sources: srcs,
								createdAt: Date.now(),
							} as ChatMessage,
						])
					} else {
						setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: answer, references: refs, sources: srcs } : m)))
					}

					if (isLoggedIn && sid) {
						setSessionId(sid)
						saveSessionId(sid)
						await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions(userId) })
						await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionMessages(userId, sid) })
					}
				}

				const processEvent = async (rawEvent: string) => {
					const lines = rawEvent.split("\n")
					const dataLines: string[] = []
					for (const line of lines) {
						const t = line.trim()
						if (t.startsWith("data:")) {
							dataLines.push(t.slice(5).trimStart())
						}
					}
					const data = dataLines.join("\n")
					if (!data) return

					try {
						const parsed = JSON.parse(data)
						if (parsed.type === "token" && typeof parsed.delta === "string") {
							applyDelta(parsed.delta)
						} else if (parsed.type === "final") {
							await applyFinal(parsed)
						}
					} catch {
						// Ignora keep-alives ou fragmentos
					}
				}

				while (true) {
					const { done, value } = await reader.read()
					if (done) break
					buffer += decoder.decode(value, { stream: true })

					const parts = buffer.split("\n\n")
					buffer = parts.pop() || ""
					for (const chunk of parts) {
						await processEvent(chunk)
					}
				}
				buffer += decoder.decode()
			} else {
				const data = await client.ask(buildPayload(question))

				setSending(false)
				const assistantMsg: ChatMessage = {
					id: crypto?.randomUUID?.() ?? String(Date.now()),
					role: "assistant",
					content: data?.answer ?? "(sem resposta)",
					sources: Array.isArray(data?.sources) ? data.sources : [],
					references: Array.isArray(data?.references) ? data.references : [],
					createdAt: Date.now(),
				}
				setMessages((prev) => [...prev, assistantMsg])

				if (isLoggedIn && data?.session_id) {
					setSessionId(data.session_id)
					saveSessionId(data.session_id)
					await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions(userId) })
					await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionMessages(userId, data.session_id) })
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

									{/* Delete */}
									<button
										type="button"
										onClick={(e) => deleteSession(s.id, e as React.MouseEvent<HTMLButtonElement>)}
										className="shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity p-1.5 text-muted-foreground hover:text-rose-600"
										title="Apagar sessão"
										aria-label="Apagar sessão"
										disabled={deleteSessionMutation.isPending}
									>
										<Trash className="h-3.5 w-3.5" />
									</button>
								</button>
							)
						})
					)}
				</div>

				{/* Footer note */}
				<div className="shrink-0 border-t border-border px-4 py-3">
					<div className="flex items-start gap-2 text-[11px] text-muted-foreground">
						<WarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
						<span>{isLoggedIn ? "Conversas ficam salvas por 7 dias. Nova sessão para mudar de assunto." : "Entre para ativar o histórico permanente."}</span>
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

						<Button
							variant="ghost"
							size="sm"
							onClick={startNewSession}
							className="h-8 px-2 gap-1.5 text-xs"
							title={isLoggedIn ? "Nova sessão" : "Nova conversa"}
						>
							<Plus className="h-3.5 w-3.5" aria-hidden="true" />
							<span className="hidden sm:inline">Nova sessão</span>
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
											? 'O histórico desta conversa é salvo automaticamente por 7 dias. Use "Nova sessão" para mudar de assunto.'
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
