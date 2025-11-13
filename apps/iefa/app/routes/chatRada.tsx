import { useAuth } from "@iefa/auth";
import { Badge, Button } from "@iefa/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertCircle,
    ArrowDown,
    Bot,
    Check,
    Copy,
    Link as LinkIcon,
    MessageSquare,
    Plus,
    RefreshCcw,
    Send,
    Sparkles,
    Trash2,
    User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

/* =========================
   Tipos
========================= */

type HealthStatus = "loading" | "ok" | "error";

type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    sources?: string[];
    references?: Array<{
        n: number;
        source: string;
        page?: number;
        snippet?: string;
        rank?: number;
        doc_id?: string;
    }>;
    error?: boolean;
    createdAt: number;
};

type AskReference = {
    n: number;
    source: string;
    page?: number;
    snippet?: string;
    rank?: number;
    doc_id?: string;
};

type AskResponse = {
    answer: string;
    references: AskReference[];
    sources: string[];
    session_id: string;
};

type RemoteMessage = {
    role: "user" | "assistant" | "system";
    content: string;
    content_json?:
        | {
              type?: "user" | "assistant" | "system";
              question?: string;
              answer?: string;
              references?: AskReference[];
              sources?: string[];
              content?: string;
          }
        | string;
    created_at: string; // ISO
};

type SessionSummary = {
    id: string;
    created_at: string; // ISO
    last_message_at?: string | null; // ISO
};

/* =========================
   Constantes
========================= */

const API_BASE = "https://iefa-rag.fly.dev";
const USE_STREAM = true;

// localStorage keys (somente quando logado)
const LS_SESSION_ID = "rada_session_id";

// Query keys centralizados
const QUERY_KEYS = {
    health: ["health"] as const,
    sessions: (userId: string | null) => ["sessions", userId] as const,
    sessionMessages: (userId: string | null, sessionId: string | null) =>
        ["sessionMessages", userId, sessionId] as const,
};

/* =========================
   Utils simples
========================= */

function loadSessionId(): string | null {
    try {
        return localStorage.getItem(LS_SESSION_ID);
    } catch {
        return null;
    }
}
function saveSessionId(id: string) {
    try {
        localStorage.setItem(LS_SESSION_ID, id);
    } catch {
        // noop
    }
}
function clearSessionId() {
    try {
        localStorage.removeItem(LS_SESSION_ID);
    } catch {
        // noop
    }
}

function cn(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
}

function StatusDot({ status }: { status: HealthStatus }) {
    const color = status === "ok" ? "bg-emerald-500" : status === "loading" ? "bg-amber-400" : "bg-rose-500";
    const pulse = status === "loading" ? "animate-pulse" : "";
    return <span className={`inline-block h-2 w-2 rounded-full ${color} ${pulse} shadow-sm`} aria-hidden="true" />;
}

function prettyStatusText(status: HealthStatus) {
    if (status === "ok") return "Online";
    if (status === "loading") return "Conectando…";
    return "Offline";
}

function isLikelyUrl(s: string) {
    try {
        const u = new URL(s);
        return !!u.protocol && !!u.host;
    } catch {
        return false;
    }
}

/* === Helpers de referências === */
type ParsedRef = { num: string; title: string; page?: string };

function stripMd(s: string) {
    return s.replace(/\*\*|__/g, "").trim();
}

function extractReferencesMd(text: string): {
    mainText: string;
    refs: ParsedRef[];
} {
    const lines = text.split(/\r?\n/);
    let refStart = -1;
    for (let i = 0; i < lines.length; i++) {
        const norm = stripMd(lines[i])
            .replace(/\s*:\s*$/, "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
        if (norm === "referencias") {
            refStart = i;
            break;
        }
    }

    let mainText = text;
    let refs: ParsedRef[] = [];

    if (refStart >= 0) {
        const before = lines.slice(0, refStart).join("\n").trimEnd();
        const after = lines.slice(refStart + 1);

        const bulletBlock: string[] = [];
        let started = false;
        for (const l of after) {
            const t = l.trim();
            if (/^[-*]\s+/.test(t)) {
                bulletBlock.push(l);
                started = true;
            } else if (t === "" && started) {
                bulletBlock.push(l);
            } else if (started) {
                break;
            }
        }

        const pageRe = /p[aá]g\.?\s*([\d]+)\b/i;
        const numRe = /\[(\d+)\]/;

        refs = bulletBlock
            .map((raw) => raw.replace(/^\s*[-*]\s+/, "").trim())
            .map((l) => {
                const clean = stripMd(l);
                const numMatch = clean.match(numRe);
                const pageMatch = clean.match(pageRe);

                let rest = clean.replace(numRe, "").trim();
                rest = rest.replace(/^[–—-]\s*/, "").trim();
                if (pageMatch && typeof pageMatch.index === "number") {
                    rest = rest
                        .slice(0, pageMatch.index)
                        .trim()
                        .replace(/[–—.,;:]\s*$/, "");
                }
                const title = rest;

                if (numMatch) {
                    return {
                        num: String(numMatch[1]),
                        title,
                        page: pageMatch ? String(pageMatch[1]) : undefined,
                    } as ParsedRef;
                }
                return null;
            })
            .filter(Boolean) as ParsedRef[];

        mainText = before.trim();
    }

    return { mainText, refs };
}
/* === FIM helpers === */

function parseContentJson(input: unknown): any {
    if (!input) return {};
    if (typeof input === "string") {
        try {
            return JSON.parse(input);
        } catch {
            return {};
        }
    }
    if (typeof input === "object") return input as any;
    return {};
}

export function meta() {
    return [{ title: "Chat RADA" }, { name: "description", content: "RAG sobre o RADA" }];
}

function formatDateShort(iso?: string | null) {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        return d.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "";
    }
}

function sessionTitleLikeChatGPT(s: SessionSummary) {
    const base = `Conversa de ${formatDateShort(s.last_message_at || s.created_at)}`;
    return base.length > 60 ? `${base.slice(0, 57)}…` : base;
}

/* =========================
   Fetch helper e cliente
========================= */

async function ragFetch(
    path: string,
    init: RequestInit & { jsonBody?: any } = {},
    opts?: { userId?: string | null; withAuth?: boolean },
) {
    const url = `${API_BASE}${path}`;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as any),
    };
    if (opts?.withAuth && opts.userId) headers["X-User-Id"] = opts.userId;

    const res = await fetch(url, {
        ...init,
        headers,
        credentials: opts?.withAuth ? "include" : "omit",
        body: init.jsonBody ? JSON.stringify(init.jsonBody) : init.body,
    });
    return res;
}

function useRagClient(userId: string | null) {
    const withAuth = !!userId;
    return useMemo(
        () => ({
            sessions: async () => {
                const res = await ragFetch("/sessions", { method: "GET" }, { withAuth, userId });
                if (!res.ok) throw new Error("Falha ao buscar sessões");
                const data: SessionSummary[] = await res.json();
                return data;
            },
            sessionMessages: async (sid: string) => {
                const res = await ragFetch(`/sessions/${sid}/messages`, { method: "GET" }, { withAuth, userId });
                if (!res.ok) throw new Error("Falha ao buscar mensagens");
                const data: RemoteMessage[] = await res.json();
                return data;
            },
            deleteSession: async (sid: string) => {
                const res = await ragFetch(`/sessions/${sid}`, { method: "DELETE" }, { withAuth, userId });
                if (!res.ok) throw new Error("Falha ao apagar sessão");
                return true;
            },
            ask: async (payload: any) => {
                const res = await ragFetch("/ask", { method: "POST", jsonBody: payload }, { withAuth, userId });
                if (!res.ok) {
                    const errText = await res.text().catch(() => "Erro desconhecido");
                    throw new Error(errText || `HTTP ${res.status}`);
                }
                const data: AskResponse = await res.json();
                return data;
            },
            askStream: async (payload: any, init?: { signal?: AbortSignal }) => {
                const res = await ragFetch(
                    "/ask/stream",
                    {
                        method: "POST",
                        jsonBody: payload,
                        headers: { Accept: "text/event-stream" },
                        signal: init?.signal,
                    },
                    { withAuth, userId },
                );
                if (!res.ok) {
                    const errText = await res.text().catch(() => "Erro desconhecido");
                    throw new Error(errText || `HTTP ${res.status}`);
                }
                return res;
            },
        }),
        [userId, withAuth],
    );
}

/* =========================
   Queries (TanStack Query)
========================= */

function useHealthQuery() {
    return useQuery({
        queryKey: QUERY_KEYS.health,
        queryFn: async () => {
            try {
                const res = await fetch(`${API_BASE}/health`);
                const data = await res.json().catch(() => ({}));
                return res.ok && data?.status === "ok" ? ("ok" as const) : ("error" as const);
            } catch {
                return "error" as const;
            }
        },
        refetchInterval: 60_000,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        initialData: "loading" as const,
    });
}

function useSessionsQuery(client: ReturnType<typeof useRagClient>, isLoggedIn: boolean, userId: string | null) {
    return useQuery({
        queryKey: QUERY_KEYS.sessions(userId),
        enabled: isLoggedIn && !!userId,
        queryFn: () => client.sessions(),
        select: (data) => {
            return [...data].sort((a, b) => {
                const ad = new Date(a.last_message_at || a.created_at).getTime();
                const bd = new Date(b.last_message_at || b.created_at).getTime();
                return bd - ad;
            });
        },
        staleTime: 30_000,
        gcTime: 5 * 60_000,
    });
}

function useSessionMessagesQuery(
    client: ReturnType<typeof useRagClient>,
    isLoggedIn: boolean,
    userId: string | null,
    sessionId: string | null,
) {
    return useQuery({
        queryKey: QUERY_KEYS.sessionMessages(userId, sessionId),
        enabled: isLoggedIn && !!userId && !!sessionId,
        queryFn: () => client.sessionMessages(sessionId!),
        select: (data) => {
            return data.map((r, i) => {
                const role = r.role === "system" ? ("assistant" as const) : (r.role as "user" | "assistant");
                const cj = parseContentJson(r.content_json);
                const content =
                    role === "assistant"
                        ? String(cj?.answer ?? "")
                        : role === "user"
                          ? String(cj?.question ?? "")
                          : String(cj?.content ?? "");

                const references: AskReference[] = Array.isArray(cj?.references) ? cj.references : [];
                const sources: string[] = Array.isArray(cj?.sources) ? cj.sources : [];

                return {
                    id: `${sessionId}-${i}`,
                    role,
                    content,
                    references,
                    sources,
                    createdAt: new Date(r.created_at).getTime(),
                } as ChatMessage;
            });
        },
        staleTime: 10_000,
        gcTime: 5 * 60_000,
    });
}

function useDeleteSessionMutation(
    client: ReturnType<typeof useRagClient>,
    userId: string | null,
    sessionId: string | null,
) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (sid: string) => client.deleteSession(sid),
        onMutate: async (sid) => {
            // Cancela queries em andamento
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.sessions(userId) });

            // Snapshot do estado anterior
            const previousSessions = queryClient.getQueryData<SessionSummary[]>(QUERY_KEYS.sessions(userId));

            // Atualização otimista
            queryClient.setQueryData<SessionSummary[]>(QUERY_KEYS.sessions(userId), (old) =>
                old ? old.filter((s) => s.id !== sid) : [],
            );

            return { previousSessions };
        },
        onError: (_err, _sid, context) => {
            // Rollback em caso de erro
            if (context?.previousSessions) {
                queryClient.setQueryData(QUERY_KEYS.sessions(userId), context.previousSessions);
            }
        },
        onSettled: () => {
            // Revalida após mutação
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions(userId) });
        },
    });
}

/* =========================
   Componentes puros
========================= */

function ReferencesList({ id, references }: { id: string; references: AskReference[] }) {
    return (
        <details className="mt-2 max-w-[85%] group">
            <summary className="list-none flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none bg-muted/30 border border-border/40 px-3 py-2 rounded-xl">
                <LinkIcon className="h-3.5 w-3.5" />
                Referências ({references.length})
            </summary>
            <div className="mt-2 space-y-2">
                {references.map((ref) => {
                    const refKey = `${ref.doc_id ?? "d"}-${ref.source}-${ref.n}-${ref.page ?? "p"}`;
                    return (
                        <details
                            key={`${id}-ref-${refKey}`}
                            className="bg-muted/20 border border-border/30 rounded-lg p-2"
                        >
                            <summary className="list-none flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                                <Badge variant="secondary" className="h-5 rounded-md text-[11px]">
                                    [{ref.n}]
                                </Badge>
                                <span className="text-xs font-medium truncate">{ref.source}</span>
                                {ref.page != null && (
                                    <span className="text-xs text-muted-foreground">pág. {ref.page}</span>
                                )}
                            </summary>
                            {ref.snippet && (
                                <div className="mt-2 text-xs text-muted-foreground pl-2 border-l-2 border-border/40">
                                    <p className="italic">
                                        {ref.snippet.substring(0, 200)}
                                        {ref.snippet.length > 200 ? "..." : ""}
                                    </p>
                                </div>
                            )}
                        </details>
                    );
                })}
            </div>
        </details>
    );
}

function SourcesList({ id, sources }: { id: string; sources: string[] }) {
    return (
        <details className="mt-2 max-w-[85%] group">
            <summary className="list-none flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none bg-muted/30 border border-border/40 px-3 py-2 rounded-xl">
                <LinkIcon className="h-3.5 w-3.5" />
                Fontes consultadas ({sources.length})
            </summary>
            <ul className="mt-2 space-y-1.5">
                {sources.map((s) => (
                    <li
                        key={`${id}-src-${s}`}
                        className="flex items-start gap-2 bg-muted/20 border border-border/30 rounded-lg p-2"
                    >
                        <span className="text-xs text-muted-foreground mt-0.5">•</span>
                        {isLikelyUrl(s) ? (
                            <a
                                className="text-xs text-primary hover:underline break-all hover:text-primary/80 transition-colors"
                                href={s}
                                target="_blank"
                                rel="noreferrer noopener"
                            >
                                {s}
                            </a>
                        ) : (
                            <code className="text-xs bg-muted/70 px-2 py-1 rounded-md border border-border/30">
                                {s}
                            </code>
                        )}
                    </li>
                ))}
            </ul>
        </details>
    );
}

function MessageItem({
    m,
    copiedMsgId,
    onCopy,
}: {
    m: ChatMessage;
    copiedMsgId: string | null;
    onCopy: (id: string, text: string) => void;
}) {
    const isUser = m.role === "user";
    const isError = !!m.error;

    const parsed = m.role === "assistant" ? extractReferencesMd(m.content) : null;
    const displayMarkdown = parsed?.mainText ?? m.content;
    const hasReferences = !!(m.references && m.references.length > 0);

    const bubbleBase = "px-4 py-3 rounded-2xl inline-block max-w-[85%] shadow-sm";
    const bubbleUser =
        "bg-linear-to-br from-primary to-primary/90 text-primary-foreground shadow-primary/10 text-sm leading-relaxed whitespace-pre-wrap";
    const bubbleError =
        "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-sm leading-relaxed";
    const bubbleAssistant = "bg-card border border-border/50 text-foreground";

    return (
        <li
            className={cn(
                "flex gap-3 group animate-in fade-in slide-in-from-bottom-4 duration-500",
                isUser && "flex-row-reverse",
            )}
        >
            {/* Avatar */}
            <div
                className={cn(
                    "shrink-0 h-9 w-9 rounded-xl flex items-center justify-center text-sm font-medium shadow-sm",
                    isUser
                        ? "bg-linear-to-br from-primary to-primary/80 text-primary-foreground shadow-primary/20"
                        : isError
                          ? "bg-linear-to-br from-rose-500 to-rose-600 text-white shadow-rose-500/20"
                          : "bg-linear-to-br from-muted to-muted/80 text-muted-foreground border border-border/50",
                )}
            >
                {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>

            {/* Conteúdo */}
            <div className={cn("flex-1 min-w-0 space-y-2", isUser && "flex flex-col items-end")}>
                <div className={cn("flex items-center gap-2", isUser && "flex-row-reverse")}>
                    <span className="text-xs font-semibold text-foreground">
                        {isUser ? "Você" : isError ? "Erro" : "Assistente"}
                    </span>
                    <span className="text-xs text-muted-foreground/70">
                        {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                        })}
                    </span>
                </div>

                <div
                    className={cn(
                        bubbleBase,
                        isUser && bubbleUser,
                        isError && bubbleError,
                        !isUser && !isError && bubbleAssistant,
                    )}
                >
                    {!isUser && !isError ? (
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkBreaks]}
                            components={{
                                a: (props) => (
                                    <a
                                        {...props}
                                        className="text-primary hover:underline"
                                        target="_blank"
                                        rel="noreferrer noopener"
                                    />
                                ),
                                p: (props) => <p {...props} className="mb-3 last:mb-0 text-sm leading-relaxed" />,
                                ul: (props) => (
                                    <ul {...props} className="list-disc pl-5 my-2 text-sm leading-relaxed" />
                                ),
                                ol: (props) => (
                                    <ol {...props} className="list-decimal pl-5 my-2 text-sm leading-relaxed" />
                                ),
                                code: (props) => (
                                    <code
                                        {...props}
                                        className="bg-muted/70 px-1.5 py-0.5 rounded border border-border/30"
                                    />
                                ),
                            }}
                        >
                            {displayMarkdown}
                        </ReactMarkdown>
                    ) : (
                        <span className="text-sm leading-relaxed">{m.content}</span>
                    )}
                </div>

                {/* Referências */}
                {!isUser && !isError && hasReferences && <ReferencesList id={m.id} references={m.references!} />}

                {/* Fontes consultadas */}
                {!isUser && !isError && m.sources && m.sources.length > 0 && (
                    <SourcesList id={m.id} sources={m.sources} />
                )}

                {/* Copiar */}
                <Button
                    className={cn(
                        "opacity-0 group-hover:opacity-100 transition-all inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted/50",
                        isUser && "ml-auto",
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
    );
}

/* =========================
   Componente principal
========================= */

export default function ChatRada() {
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const isLoggedIn = !!userId;

    const client = useRagClient(userId);
    const queryClient = useQueryClient();

    const healthQuery = useHealthQuery();
    const health: HealthStatus = healthQuery.data ?? "loading";
    const checkHealth = useCallback(() => healthQuery.refetch(), [healthQuery]);

    const { data: sessions = [] } = useSessionsQuery(client, isLoggedIn, userId);

    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);

    const [sessionId, setSessionId] = useState<string | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const sseAbortRef = useRef<AbortController | null>(null);

    const deleteSessionMutation = useDeleteSessionMutation(client, userId, sessionId);

    // Login/sessionId sync
    useEffect(() => {
        if (isLoggedIn) {
            const sid = loadSessionId();
            if (sid) setSessionId(sid);
        } else {
            setSessionId(null);
            clearSessionId();
        }
    }, [isLoggedIn]);

    // Carrega histórico ao mudar sessionId (via query)
    const { data: sessionMessages = [] } = useSessionMessagesQuery(client, isLoggedIn, userId, sessionId);

    useEffect(() => {
        if (!isLoggedIn || !userId || !sessionId) return;
        setMessages(sessionMessages);
    }, [isLoggedIn, userId, sessionId, sessionMessages]);

    // Auto-scroll para o fim quando novas mensagens chegam e o usuário está no fim
    const scrollToBottom = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, []);

    useEffect(() => {
        if (isAtBottom && messages.length > 0) {
            scrollToBottom();
        }
    }, [messages, isAtBottom, scrollToBottom]);

    const onScrollMessages = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const threshold = 48;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
        setIsAtBottom(atBottom);
    }, []);

    const startNewSession = useCallback(() => {
        if (isLoggedIn) {
            clearSessionId();
            setSessionId(null);
        }
        setMessages([]);
    }, [isLoggedIn]);

    const selectSession = useCallback(
        (sid: string) => {
            if (!isLoggedIn) return;
            if (!sid || sid === sessionId) return;
            saveSessionId(sid);
            setSessionId(sid);
            setMessages([]);
        },
        [isLoggedIn, sessionId],
    );

    const deleteSession = useCallback(
        async (sid: string, e?: React.MouseEvent<HTMLButtonElement>) => {
            if (!isLoggedIn || !userId) return;
            e?.stopPropagation();
            try {
                await deleteSessionMutation.mutateAsync(sid);
                if (sessionId === sid) {
                    startNewSession();
                }
            } catch {
                // Erro já tratado pela mutation
            }
        },
        [isLoggedIn, userId, deleteSessionMutation, sessionId, startNewSession],
    );

    // Cancela SSE ativo ao desmontar
    useEffect(() => {
        return () => {
            if (sseAbortRef.current) {
                sseAbortRef.current.abort();
                sseAbortRef.current = null;
            }
        };
    }, []);

    const buildPayload = useCallback(
        (question: string) => {
            const base: Record<string, any> = { question };
            if (isLoggedIn && sessionId) base.session_id = sessionId;
            return base;
        },
        [isLoggedIn, sessionId],
    );

    const onSubmit = useCallback(async () => {
        const question = input.trim();
        if (!question || sending) return;

        // Cancela qualquer SSE anterior antes de iniciar um novo
        if (sseAbortRef.current) {
            sseAbortRef.current.abort();
            sseAbortRef.current = null;
        }

        const userMsg: ChatMessage = {
            id: crypto?.randomUUID?.() ?? String(Date.now()),
            role: "user",
            content: question,
            createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setSending(true);

        const assistantId = crypto?.randomUUID?.() ?? `${Date.now()}-assistant`;
        const insertAssistantShell = () => {
            setMessages((prev) => [
                ...prev,
                {
                    id: assistantId,
                    role: "assistant",
                    content: "",
                    sources: [],
                    references: [],
                    createdAt: Date.now(),
                },
            ]);
        };

        try {
            if (USE_STREAM) {
                insertAssistantShell();

                const ctrl = new AbortController();
                sseAbortRef.current = ctrl;

                const res = await client.askStream(buildPayload(question), { signal: ctrl.signal });
                if (!res.body) {
                    const errText = await res.text().catch(() => "Erro desconhecido");
                    throw new Error(errText);
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                const applyDelta = (delta: string) => {
                    setMessages((prev) =>
                        prev.map((m) => (m.id === assistantId ? { ...m, content: (m.content || "") + delta } : m)),
                    );
                };

                const applyFinal = async (finalPayload: any) => {
                    const answer = String(finalPayload.answer ?? "");
                    const refs = Array.isArray(finalPayload.references)
                        ? (finalPayload.references as AskReference[])
                        : [];
                    const srcs = Array.isArray(finalPayload.sources) ? (finalPayload.sources as string[]) : [];
                    const sid = String(finalPayload.session_id || finalPayload.sessionId || "");

                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantId ? { ...m, content: answer, references: refs, sources: srcs } : m,
                        ),
                    );

                    if (isLoggedIn && sid) {
                        setSessionId(sid);
                        saveSessionId(sid);
                        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions(userId) });
                        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionMessages(userId, sid) });
                    }
                };

                const processEvent = async (rawEvent: string) => {
                    const lines = rawEvent.split("\n");

                    const dataLines: string[] = [];
                    for (const line of lines) {
                        const t = line.trim();
                        if (t.startsWith("data:")) {
                            dataLines.push(t.slice(5).trimStart());
                        }
                    }
                    const data = dataLines.join("\n");
                    if (!data) return;

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.type === "token" && typeof parsed.delta === "string") {
                            applyDelta(parsed.delta);
                        } else if (parsed.type === "final") {
                            await applyFinal(parsed);
                        }
                    } catch {
                        // Ignora keep-alives ou fragmentos
                    }
                };

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });

                    const parts = buffer.split("\n\n");
                    buffer = parts.pop() || "";
                    for (const chunk of parts) {
                        await processEvent(chunk);
                    }
                }
                buffer += decoder.decode();
            } else {
                const data = await client.ask(buildPayload(question));

                const assistantMsg: ChatMessage = {
                    id: crypto?.randomUUID?.() ?? String(Date.now()),
                    role: "assistant",
                    content: data?.answer ?? "(sem resposta)",
                    sources: Array.isArray(data?.sources) ? data.sources : [],
                    references: Array.isArray(data?.references) ? data.references : [],
                    createdAt: Date.now(),
                };
                setMessages((prev) => [...prev, assistantMsg]);

                if (isLoggedIn && data?.session_id) {
                    setSessionId(data.session_id);
                    saveSessionId(data.session_id);
                    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions(userId) });
                    await queryClient.invalidateQueries({
                        queryKey: QUERY_KEYS.sessionMessages(userId, data.session_id),
                    });
                }
            }
        } catch (err: any) {
            if (err?.name === "AbortError") {
                return;
            }
            const assistantErr: ChatMessage = {
                id: crypto?.randomUUID?.() ?? String(Date.now()),
                role: "assistant",
                content: "Ocorreu um erro ao consultar o serviço. Tente novamente em instantes.",
                error: true,
                createdAt: Date.now(),
            };
            setMessages((prev) => [...prev, assistantErr]);
        } finally {
            setSending(false);
            if (sseAbortRef.current) {
                sseAbortRef.current = null;
            }
        }
    }, [input, sending, buildPayload, client, isLoggedIn, userId, queryClient]);

    const onKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
            }
        },
        [onSubmit],
    );

    const copyMessage = useCallback(async (id: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedMsgId(id);
            setTimeout(() => setCopiedMsgId(null), 1500);
        } catch {
            // noop
        }
    }, []);

    const healthBadge = useMemo(
        () => (
            <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-muted/50 border border-border/50">
                <StatusDot status={health} />
                <span className="font-medium text-muted-foreground">{prettyStatusText(health)}</span>
            </div>
        ),
        [health],
    );

    return (
        <div className="relative h-[calc(100vh-8rem)] w-full bg-linear-to-b from-background to-muted/20 text-foreground rounded-xl border border-border/50 overflow-hidden shadow-xl">
            {/* Blobs decorativos */}
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
                <div
                    className="absolute left-1/2 top-[-20%] h-200 w-200 -translate-x-1/2 rounded-full blur-3xl
                     bg-linear-to-br from-primary/20 via-violet-500/10 to-transparent
                     dark:from-primary/25 dark:via-violet-400/10 animate-pulse"
                    style={{ animationDuration: "4s" }}
                />
                <div
                    className="absolute right-[-10%] bottom-[-10%] h-160 w-160 rounded-full blur-3xl
                     bg-linear-to-tl from-fuchsia-500/15 via-primary/10 to-transparent
                     dark:from-fuchsia-400/15 dark:via-primary/10"
                />
            </div>

            <div className="flex h-full">
                {/* Sidebar */}
                <aside className="hidden md:flex w-72 flex-col border-r border-border/50 bg-background/80 backdrop-blur-xl">
                    <div className="p-3 border-b border-border/50">
                        <Button
                            onClick={startNewSession}
                            variant="secondary"
                            className="w-full justify-start gap-2 rounded-lg"
                            title={isLoggedIn ? "Iniciar nova sessão" : "Nova conversa (sem histórico)"}
                        >
                            <Plus className="h-4 w-4" />
                            Nova conversa
                        </Button>

                        {!isLoggedIn && (
                            <div className="mt-3 text-[11px] text-muted-foreground">
                                <div className="flex items-start gap-2 bg-muted/40 border border-border/50 rounded-lg p-2">
                                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5" />
                                    <span>Você está deslogado. O histórico está desativado e não será salvo.</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                        {!isLoggedIn ? (
                            <div className="h-full flex items-center justify-center text-center px-4">
                                <div className="text-xs text-muted-foreground">
                                    Faça login para ver e manter o histórico das suas conversas.
                                </div>
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-center px-4">
                                <div className="text-xs text-muted-foreground">
                                    Nenhuma sessão encontrada. Inicie uma nova conversa.
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {sessions.map((s) => {
                                    const active = s.id === sessionId;
                                    return (
                                        <Button
                                            key={s.id}
                                            onClick={() => selectSession(s.id)}
                                            variant="ghost"
                                            className={cn(
                                                "w-full text-xs",
                                                active ? "bg-primary/10 border-primary/30" : "",
                                            )}
                                            title={sessionTitleLikeChatGPT(s)}
                                            aria-label={`Abrir sessão ${sessionTitleLikeChatGPT(s)}`}
                                        >
                                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                            <div className="flex-1 min-w-0">
                                                {sessionTitleLikeChatGPT(s)}
                                                <div className="text-[10px] text-muted-foreground truncate">
                                                    {formatDateShort(s.last_message_at || s.created_at)}
                                                </div>
                                            </div>
                                            <Button
                                                onClick={(e) => deleteSession(s.id, e)}
                                                variant="ghost"
                                                title="Apagar sessão"
                                                aria-label="Apagar sessão"
                                                disabled={deleteSessionMutation.isPending}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </Button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="p-3 border-t border-border/50 text-[11px] text-muted-foreground">
                        {isLoggedIn ? (
                            <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
                                <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5" />
                                <span>
                                    As sessões expiram em 7 dias. Inicie uma nova conversa para começar um novo
                                    contexto.
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-start gap-2 bg-muted/40 border border-border/50 rounded-lg p-2">
                                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                                <span>Faça login para ativar o histórico. Sessões salvas expiram em 7 dias.</span>
                            </div>
                        )}
                    </div>
                </aside>

                {/* Main */}
                <main className="flex-1 flex flex-col">
                    {/* Header */}
                    <header className="shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-xl px-4 md:px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-linear-to-br from-primary to-primary/80 shadow-lg shadow-primary/20">
                                    <Sparkles className="h-5 w-5 text-primary-foreground" />
                                </div>
                                <div>
                                    <h2 className="text-base md:text-lg font-semibold tracking-tight">Chat RADA</h2>
                                    <p className="text-xs text-muted-foreground">Assistente Inteligente</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                {healthBadge}

                                {isLoggedIn && sessionId && (
                                    <span className="text-[11px] text-muted-foreground px-2 py-1 border border-border/50 rounded-full">
                                        sessão: {sessionId.slice(0, 8)}…
                                    </span>
                                )}

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={checkHealth}
                                    className="h-9 w-9 p-0 hover:bg-muted/80 transition-colors"
                                    title="Atualizar status"
                                    aria-label="Atualizar status"
                                >
                                    <RefreshCcw className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={startNewSession}
                                    className="h-9 px-2 hover:bg-muted/80 transition-colors"
                                    title={
                                        isLoggedIn
                                            ? "Iniciar nova sessão (memória reinicia)"
                                            : "Nova conversa (histórico desativado)"
                                    }
                                >
                                    Nova sessão
                                </Button>
                            </div>
                        </div>
                    </header>

                    {/* Aviso inicial */}
                    {messages.length === 0 && (
                        <div className="shrink-0 px-4 md:px-6 py-4">
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3 backdrop-blur-sm">
                                <div className="shrink-0 h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-1">
                                        Importante
                                    </p>
                                    {isLoggedIn ? (
                                        <p className="text-sm text-amber-800/90 dark:text-amber-200/80">
                                            Este chat possui memória por sessão (armazenada no Supabase). Use "Nova
                                            sessão" para iniciar um novo contexto, ou "Apagar sessão" para excluir a
                                            sessão atual no backend.
                                        </p>
                                    ) : (
                                        <p className="text-sm text-amber-800/90 dark:text-amber-200/80">
                                            Você está deslogado. O histórico está desativado e suas mensagens não serão
                                            salvas. Faça login para ativar o histórico por sessão.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Mensagens */}
                    <div className="flex-1 overflow-hidden flex flex-col relative">
                        <div
                            ref={scrollRef}
                            onScroll={onScrollMessages}
                            className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
                        >
                            <div className="px-4 md:px-6 py-6 space-y-6">
                                {messages.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-center">
                                        <div className="space-y-4 max-w-md">
                                            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-linear-to-br from-primary to-primary/80 shadow-lg shadow-primary/20 mb-2">
                                                <Sparkles className="h-8 w-8 text-primary-foreground" />
                                            </div>
                                            <div className="text-3xl md:text-4xl font-bold bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                                                Chat RADA
                                            </div>
                                            <p className="text-sm text-muted-foreground leading-relaxed">
                                                Consulte o Regulamento de Administração da Aeronáutica usando
                                                inteligência artificial
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <ul className="space-y-6">
                                        {messages.map((m) => (
                                            <MessageItem
                                                key={m.id}
                                                m={m}
                                                copiedMsgId={copiedMsgId}
                                                onCopy={copyMessage}
                                            />
                                        ))}

                                        {/* Estado enviando */}
                                        {sending && (
                                            <li className="flex gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                <div className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center bg-linear-to-br from-muted to-muted/80 border border-border/50 shadow-sm">
                                                    <Bot className="h-4 w-4 text-muted-foreground animate-pulse" />
                                                </div>
                                                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-card border border-border/50 shadow-sm">
                                                    <div className="flex gap-1">
                                                        <span
                                                            className="h-2 w-2 rounded-full bg-primary/60 animate-bounce"
                                                            style={{ animationDelay: "0ms" }}
                                                        />
                                                        <span
                                                            className="h-2 w-2 rounded-full bg-primary/60 animate-bounce"
                                                            style={{ animationDelay: "150ms" }}
                                                        />
                                                        <span
                                                            className="h-2 w-2 rounded-full bg-primary/60 animate-bounce"
                                                            style={{ animationDelay: "300ms" }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-muted-foreground font-medium">
                                                        Processando sua pergunta…
                                                    </span>
                                                </div>
                                            </li>
                                        )}
                                    </ul>
                                )}
                            </div>
                        </div>

                        {/* Botão voltar ao fim */}
                        {!isAtBottom && (
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <Button
                                    onClick={scrollToBottom}
                                    className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/95 backdrop-blur-xl px-4 py-2 text-xs font-medium text-foreground hover:bg-muted/80 transition-all shadow-lg hover:shadow-xl hover:scale-105"
                                >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                    Novas mensagens
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="shrink-0 border-t border-border/50 bg-background/95 backdrop-blur-xl px-4 md:px-6 py-4">
                        <div className="flex items-end gap-3">
                            <div className="flex-1 relative">
                                <textarea
                                    ref={editorRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={onKeyDown}
                                    rows={1}
                                    placeholder="Escreva sua pergunta sobre o RADA…"
                                    className="w-full resize-none rounded-xl border border-border/60 bg-background px-4 py-3 text-sm
                             placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2
                             focus-visible:ring-primary/50 focus-visible:border-primary/50 transition-all shadow-sm"
                                    aria-label="Caixa de texto da mensagem"
                                />
                            </div>
                            <Button
                                onClick={onSubmit}
                                disabled={sending || !input.trim() || health !== "ok"}
                                size="sm"
                                className="shrink-0 h-11 w-11 rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                                title={health !== "ok" ? "Serviço indisponível" : "Enviar"}
                                aria-label="Enviar"
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/50 font-mono text-[10px]">
                                    Enter
                                </kbd>{" "}
                                para enviar •{" "}
                                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/50 font-mono text-[10px]">
                                    Shift + Enter
                                </kbd>{" "}
                                para quebra de linha
                            </span>
                            {health !== "ok" && (
                                <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1.5">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    Serviço indisponível
                                </span>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
