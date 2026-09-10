import { zValidator } from "@hono/zod-validator"
import { createRunCollector } from "@iefa/alpha-client/tracer"
import { HumanMessage } from "@langchain/core/messages"
import type { User } from "@supabase/supabase-js"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { streamSSE } from "hono/streaming"
import { v4 as uuid } from "uuid"
import { z } from "zod"
import { supabase } from "../db/supabase"
import { GRAPH_INVOKE_CONFIG, graph } from "../graph"
import { messageText } from "../lib/message-text.ts"
import type { AppRole } from "../middleware/auth"
import { authMiddleware, requireRole } from "../middleware/auth"
import { embedDocuments } from "../sources/embeddings"
import { ingestSource } from "../sources/pipeline"
import { getSource, hasAdapter, listSources, resolveAdapter } from "../sources/registry"
import type { NormativeSourceRow } from "../sources/types"
import { canAccessSession } from "./authorize"
import { complianceRoutes } from "./compliance"
import { submissionRoutes } from "./submissions"

// ─── Tipos ───────────────────────────────────────────────────────────────────

type AppVariables = {
	user: User
	role: AppRole
}

/** Linhas de `query_log` lidas para montar a lista de sessões. */
const ROW_WINDOW = 500
/** Sessões devolvidas. `truncated` avisa quando há mais do que isto. */
const MAX_SESSIONS = 50

// ─── Schemas de input ─────────────────────────────────────────────────────────

const MessageBodySchema = z.object({
	message: z.string().min(1),
})

const SourceDocumentsQuerySchema = z.object({
	include_superseded: z.enum(["true", "false"]).optional(),
})

/** Teto de itens por chamada HTTP de coleta — ver o comentário na rota. */
const HTTP_REFRESH_MAX_ITEMS = 10

const RefreshBodySchema = z.object({
	/** Sem `apply`, a coleta só relata o que aconteceria — o padrão é não escrever. */
	apply: z.boolean().default(false),
	limit: z.number().int().positive().max(HTTP_REFRESH_MAX_ITEMS).optional(),
})

// ─── Tipos de resposta ────────────────────────────────────────────────────────

type SessionCreatedResponse = {
	session_id: string
	user_id: string
	created_at: string
	_links: {
		self: { href: string }
		messages: { href: string }
	}
}

type MessageResponse = {
	session_id: string
	final_response: string | null
	cited_documents: string[]
	termination_reason?: string
	intent?: string
	retrieval_iterations?: number
	_links: {
		self: { href: string }
		chunks: Array<{ href: string }>
	}
}

type MessagesListResponse = {
	session_id: string
	messages: Array<{ role: string; content: string; cited_documents: string[] }>
	_links: { self: { href: string } }
}

type ChunkResponse = {
	id: string
	content: string
	chapter: string | null
	article: string | null
	section: string | null
	chunk_index: number
	token_count: number
	metadata: unknown
	document_id: string
	_links: {
		self: { href: string }
		document: { href: string }
	}
}

type SourcesListResponse = {
	sources: Array<NormativeSourceRow & { has_adapter: boolean; _links: { self: { href: string }; documents: { href: string } } }>
	_links: { self: { href: string } }
}

type DocumentSummary = {
	id: string
	title: string
	document_type: string
	version_label: string | null
	effective_from: string | null
	superseded_at: string | null
	content_hash: string | null
	external_id: string | null
	source: string | null
}

type SourceDocumentsResponse = {
	source_id: string
	documents: Array<DocumentSummary & { _links: { self: { href: string }; structure: { href: string } } }>
	_links: { self: { href: string } }
}

type DocumentStructureResponse = {
	document: {
		id: string
		title: string
		document_type: string
		version_label: string | null
		effective_from: string | null
		superseded_at: string | null
	}
	nodes: Array<{
		id: string
		path: string
		ordinal: number
		level: number
		title: string
		title_norm: string
		ref_label: string | null
		is_required: boolean
		body: string | null
		explanatory_note: Array<{ id: string; content: string; cited_refs: unknown }>
		placeholder: Array<{ id: string; token: string }>
	}>
	_links: { self: { href: string }; document: { href: string } }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildResponse(session_id: string, state: any): MessageResponse {
	const chunkLinks = (state.cited_documents ?? []).map((id: string) => ({
		href: `/api/v1/chunks/${id}`,
	}))
	return {
		session_id,
		final_response: state.final_response,
		cited_documents: state.cited_documents ?? [],
		termination_reason: state.termination_reason,
		intent: state.intent,
		retrieval_iterations: state.retrieval_iterations,
		_links: { self: { href: `/api/v1/sessions/${session_id}/messages` }, chunks: chunkLinks },
	}
}

/**
 * Registra o turno.
 *
 * A falha era engolida, e `query_log` não é só telemetria: é de onde saem a lista de
 * sessões, as citações do histórico e o dono que `canAccessSession` confere. Perder a
 * linha em silêncio some com a conversa da lista, desalinha as citações e — o pior —
 * deixa `canAccessSession` devolver `true` para aquela sessão a QUALQUER autenticado,
 * porque ela passa a não ter dono registrado.
 *
 * Não relança: o usuário já recebeu a resposta, e derrubar o turno depois disso trocaria
 * um registro perdido por uma resposta perdida. O aviso é o que torna a perda visível.
 */
async function logQuery(session_id: string, user_id: string, query: string, state: any, latency_ms: number, langsmith_run_id: string | null = null) {
	const { error } = await supabase.from("query_log").insert({
		session_id,
		user_id,
		original_query: query,
		reformulated_query: state.reformulated_query,
		intent: state.intent,
		termination_reason: state.termination_reason ?? "no_documents_found",
		retrieval_iterations: state.retrieval_iterations ?? 0,
		grading_retries: state.grading_retries ?? 0,
		cited_documents: state.cited_documents ?? [],
		latency_ms,
		langsmith_run_id,
	})

	if (error) console.error(`[query_log] turno não registrado (sessão ${session_id}): ${error.message}`)
}

// ─── Rotas ────────────────────────────────────────────────────────────────────

/**
 * Origens que podem chamar o α pelo browser.
 *
 * O console e o ChatRADA vivem no portal, em domínio diferente do α, então toda
 * chamada é cross-origin — sem isto o browser bloqueia antes de sair o request,
 * e a tela mostra "Failed to fetch" sem nenhum erro do lado do servidor.
 * `credentials` fica desligado de propósito: a autenticação é por Bearer, não
 * por cookie.
 */
const ALLOWED_ORIGINS = ["https://portal.iefa.com.br", "https://iefa.com.br", "https://www.iefa.com.br", "http://localhost:3000", "http://localhost:3010"]

const app = new Hono<{ Variables: AppVariables }>()
	.use(
		"/api/v1/*",
		cors({
			origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]),
			allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization"],
			maxAge: 300,
		})
	)
	.use("/api/v1/*", authMiddleware)
	// Submissão e extração (Etapa 1.4) — montadas depois do middleware de auth.
	.route("/", submissionRoutes)
	// Conformidade e bancada de regras (Etapas 1.5–1.7).
	.route("/", complianceRoutes)

	// POST /api/v1/sessions — cria nova sessão de conversa
	/**
	 * GET /api/v1/sessions — conversas do usuário, da mais recente para a mais antiga.
	 *
	 * A sessão não tem tabela própria: ela é um UUID que o cliente cunha e que o α passa a
	 * conhecer quando a primeira pergunta é registrada em `query_log`. Daí a lista sair
	 * daqui, com a primeira pergunta servindo de título — é o que o usuário reconhece.
	 *
	 * Sem este endpoint o ChatRADA não tinha como oferecer histórico: a tela chamava um
	 * `GET /sessions` que nunca existiu e recebia 404.
	 */
	.get("/api/v1/sessions", async (c) => {
		const user = c.get("user")

		// Janela deliberada, e o rótulo diz o que ela é. Sem tabela de sessão, a lista sai de
		// `query_log`, e qualquer limite corta as conversas mais antigas. O título é a
		// pergunta MAIS RECENTE da conversa dentro da janela — não a que a abriu, que pode
		// ter ficado de fora — porque um título que muda conforme a janela desliza é pior do
		// que um título que sempre diz a verdade sobre o que mostra.
		const { data, error } = await supabase
			.from("query_log")
			.select("session_id, original_query, created_at")
			.eq("user_id", user.id)
			.order("created_at", { ascending: false })
			.limit(ROW_WINDOW)

		if (error) return c.json({ error: "Internal Server Error", code: "QUERY_FAILED" }, 500)

		// Uma linha por sessão. A ordenação acima é decrescente, então a PRIMEIRA linha de
		// cada sessão é a mais recente — dela vem o `last_message_at`; o título é a pergunta
		// mais antiga, que é a que abriu a conversa.
		const bySession = new Map<string, { session_id: string; title: string; last_message_at: string; messages: number }>()
		for (const row of data ?? []) {
			const current = bySession.get(row.session_id)
			// As linhas vêm da mais recente para a mais antiga, então a PRIMEIRA de cada
			// sessão dá o título e a data; as seguintes só contam.
			if (current) current.messages += 1
			else
				bySession.set(row.session_id, { session_id: row.session_id, title: row.original_query ?? "(sem título)", last_message_at: row.created_at, messages: 1 })
		}

		const sessions = [...bySession.values()].slice(0, MAX_SESSIONS)
		return c.json({ sessions, truncated: (data?.length ?? 0) >= ROW_WINDOW || bySession.size > MAX_SESSIONS })
	})

	.post("/api/v1/sessions", async (c) => {
		const user = c.get("user")
		const session_id = uuid()
		return c.json<SessionCreatedResponse>(
			{
				session_id,
				user_id: user.id,
				created_at: new Date().toISOString(),
				_links: {
					self: { href: `/api/v1/sessions/${session_id}` },
					messages: { href: `/api/v1/sessions/${session_id}/messages` },
				},
			},
			201
		)
	})

	// POST /api/v1/sessions/:session_id/messages — resposta completa, tipada para hc()
	.post("/api/v1/sessions/:session_id/messages", zValidator("json", MessageBodySchema), async (c) => {
		const session_id = c.req.param("session_id")
		const user = c.get("user")
		const { message } = c.req.valid("json")

		if (!(await canAccessSession(session_id, user))) {
			return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		}

		const input = { messages: [new HumanMessage(message)], session_id, user_id: user.id }
		const config = { configurable: { thread_id: session_id } }

		const tracer = createRunCollector()
		const startMs = Date.now()
		const result = await graph.invoke(input, { ...config, ...GRAPH_INVOKE_CONFIG, ...(tracer ? { callbacks: tracer.callbacks } : {}) })
		const latency_ms = Date.now() - startMs
		await logQuery(session_id, user.id, message, result, latency_ms, tracer?.getRunId() ?? null)
		return c.json<MessageResponse>(buildResponse(session_id, result))
	})

	// POST /api/v1/sessions/:session_id/messages/stream — streaming de eventos SSE
	.post("/api/v1/sessions/:session_id/messages/stream", zValidator("json", MessageBodySchema), async (c) => {
		const session_id = c.req.param("session_id")
		const user = c.get("user")
		const { message } = c.req.valid("json")

		if (!(await canAccessSession(session_id, user))) {
			return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		}

		const input = { messages: [new HumanMessage(message)], session_id, user_id: user.id }
		const config = { configurable: { thread_id: session_id } }

		return streamSSE(c, async (stream) => {
			const timeoutId = setTimeout(async () => {
				await stream.writeSSE({ event: "error", data: JSON.stringify({ code: "CONNECTION_TIMEOUT" }) })
				stream.abort()
			}, 60_000)
			try {
				const tracer = createRunCollector()
				const startMs = Date.now()
				const gs = await graph.stream(input, { ...config, ...GRAPH_INVOKE_CONFIG, streamMode: "updates", ...(tracer ? { callbacks: tracer.callbacks } : {}) })
				for await (const chunk of gs) {
					const node = Object.keys(chunk)[0]
					await stream.writeSSE({
						event: "status",
						data: JSON.stringify({ node, iteration: (chunk as any)[node]?.retrieval_iterations }),
					})
				}
				const finalState = await graph.getState(config)
				clearTimeout(timeoutId)
				const latency_ms = Date.now() - startMs
				await logQuery(session_id, user.id, message, finalState.values, latency_ms, tracer?.getRunId() ?? null)
				await stream.writeSSE({ event: "complete", data: JSON.stringify(buildResponse(session_id, finalState.values)) })
			} catch {
				clearTimeout(timeoutId)
				await stream.writeSSE({ event: "error", data: JSON.stringify({ code: "INTERNAL_ERROR" }) })
			}
		})
	})

	// GET /api/v1/sessions/:session_id/messages — histórico de mensagens
	.get("/api/v1/sessions/:session_id/messages", async (c) => {
		const session_id = c.req.param("session_id")
		const user = c.get("user")

		if (!(await canAccessSession(session_id, user))) {
			return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		}

		const state = await graph.getState({ configurable: { thread_id: session_id } })
		// O checkpointer guarda o texto das mensagens, mas não o que foi citado — isso vive
		// em `query_log`, uma linha por pergunta. Sem esta junção, reabrir uma conversa
		// devolvia as respostas sem nenhuma referência, e o painel de fontes ficava vazio
		// para tudo que não fosse o turno recém-respondido.
		const { data: logRows } = await supabase
			.from("query_log")
			.select("cited_documents, created_at")
			.eq("session_id", session_id)
			.order("created_at", { ascending: true })

		// `messageText` e não `m.content`: mensagem do assistente restaurada do checkpointer
		// pode trazer o conteúdo como ARRAY de blocos do Bedrock, e devolvê-lo cru faz o
		// histórico chegar ao portal como "[object Object]".
		const raw = (state.values?.messages ?? []) as Array<{ type?: string; content?: unknown }>
		const answerCount = raw.filter((m) => m.type === "ai").length

		// O pareamento é POSICIONAL, e só vale se as contagens baterem exatamente. Um turno
		// cujo `query_log` não foi gravado — SSE cortado, timeout depois do checkpoint —
		// deslocaria todas as respostas seguintes para os trechos de OUTRA pergunta: texto
		// real da norma sob uma resposta que ele não embasou. Na dúvida, nenhuma citação:
		// citação errada é pior que citação ausente.
		const alignable = (logRows ?? []).length === answerCount

		let answerIndex = 0
		const messages = raw.map((m) => {
			const role = m.type ?? "unknown"
			const cited = role === "ai" && alignable ? ((logRows ?? [])[answerIndex++]?.cited_documents ?? []) : []
			return { role, content: messageText(m.content), cited_documents: cited as string[] }
		})
		return c.json<MessagesListResponse>({
			session_id,
			messages,
			_links: { self: { href: `/api/v1/sessions/${session_id}/messages` } },
		})
	})

	// GET /api/v1/chunks/:id — busca chunk por ID
	.get("/api/v1/chunks/:id", async (c) => {
		const id = c.req.param("id")
		const { data, error } = await supabase
			.from("document_chunk")
			.select("id, content, chapter, article, section, chunk_index, token_count, metadata, document_id")
			.eq("id", id)
			.single()
		if (error || !data) {
			return c.json({ error: "Not Found", code: "CHUNK_NOT_FOUND" }, 404)
		}
		return c.json<ChunkResponse>({
			...data,
			_links: {
				self: { href: `/api/v1/chunks/${id}` },
				document: { href: `/api/v1/documents/${data.document_id}` },
			},
		})
	})

	// GET /api/v1/sources — registry de fontes normativas
	.get("/api/v1/sources", async (c) => {
		const sources = await listSources()
		return c.json<SourcesListResponse>({
			sources: sources.map((source) => ({
				...source,
				has_adapter: hasAdapter(source.id),
				_links: { self: { href: `/api/v1/sources/${source.id}` }, documents: { href: `/api/v1/sources/${source.id}/documents` } },
			})),
			_links: { self: { href: "/api/v1/sources" } },
		})
	})

	// POST /api/v1/sources/:id/refresh — coleta sob demanda (dry-run por padrão)
	.post("/api/v1/sources/:id/refresh", requireRole(["app_aci"]), zValidator("json", RefreshBodySchema), async (c) => {
		const id = c.req.param("id")
		const { apply, limit } = c.req.valid("json")

		const source = await getSource(id)
		if (!source) return c.json({ error: "Not Found", code: "SOURCE_NOT_FOUND" }, 404)
		if (!hasAdapter(source.id)) return c.json({ error: "Not Implemented", code: "SOURCE_ADAPTER_MISSING" }, 501)

		try {
			// A coleta da AGU baixa um .docx por modelo (~50) e cada um leva
			// segundos: sem teto, a rota estoura o limite de 60s do ALB e o cliente
			// recebe 504 no meio de uma ingestão que continua rodando. A varredura
			// completa é do job agendado e do CLI, que não têm essa restrição.
			const effectiveLimit = Math.min(limit ?? HTTP_REFRESH_MAX_ITEMS, HTTP_REFRESH_MAX_ITEMS)
			const report = await ingestSource({ sourceId: source.id, adapter: resolveAdapter(source), embed: embedDocuments, apply, limit: effectiveLimit })
			return c.json({ ...report, limit_applied: effectiveLimit })
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			await supabase
				.from("normative_source")
				.update({ last_checked_at: new Date().toISOString(), last_error: message.slice(0, 500) })
				.eq("id", source.id)
			return c.json({ error: "Bad Gateway", code: "SOURCE_REFRESH_FAILED", message }, 502)
		}
	})

	// GET /api/v1/sources/:id/documents — versões ingeridas de uma fonte
	.get("/api/v1/sources/:id/documents", zValidator("query", SourceDocumentsQuerySchema), async (c) => {
		const id = c.req.param("id")
		const includeSuperseded = c.req.valid("query").include_superseded === "true"

		let query = supabase
			.from("document")
			.select("id, title, document_type, version_label, effective_from, superseded_at, content_hash, external_id, source")
			.eq("source_id", id)
			.order("effective_from", { ascending: false, nullsFirst: false })

		if (!includeSuperseded) query = query.is("superseded_at", null)

		const { data, error } = await query
		if (error) return c.json({ error: "Internal Server Error", code: "SOURCE_DOCUMENTS_FAILED" }, 500)

		return c.json<SourceDocumentsResponse>({
			source_id: id,
			documents: (data ?? []).map((document) => ({
				...document,
				_links: { self: { href: `/api/v1/documents/${document.id}` }, structure: { href: `/api/v1/documents/${document.id}/structure` } },
			})),
			_links: { self: { href: `/api/v1/sources/${id}/documents` } },
		})
	})

	// GET /api/v1/documents/:id/structure — árvore de seções, notas e placeholders
	.get("/api/v1/documents/:id/structure", async (c) => {
		const id = c.req.param("id")

		const { data: document, error: documentError } = await supabase
			.from("document")
			.select("id, title, document_type, version_label, effective_from, superseded_at")
			.eq("id", id)
			.maybeSingle()

		if (documentError) return c.json({ error: "Internal Server Error", code: "DOCUMENT_FAILED" }, 500)
		if (!document) return c.json({ error: "Not Found", code: "DOCUMENT_NOT_FOUND" }, 404)

		const { data: nodes, error: nodesError } = await supabase
			.from("structure_node")
			.select("id, path, ordinal, level, title, title_norm, ref_label, is_required, body, explanatory_note(id, content, cited_refs), placeholder(id, token)")
			.eq("document_id", id)
			.order("ordinal")

		if (nodesError) return c.json({ error: "Internal Server Error", code: "STRUCTURE_FAILED" }, 500)

		return c.json<DocumentStructureResponse>({
			document,
			nodes: (nodes ?? []) as DocumentStructureResponse["nodes"],
			_links: { self: { href: `/api/v1/documents/${id}/structure` }, document: { href: `/api/v1/documents/${id}` } },
		})
	})

export default app
export type AppRoutes = typeof app
