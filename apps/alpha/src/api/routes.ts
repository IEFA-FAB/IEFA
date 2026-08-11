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
import type { AppRole } from "../middleware/auth"
import { authMiddleware, requireRole } from "../middleware/auth"
import { embedDocuments } from "../sources/embeddings"
import { ingestSource } from "../sources/pipeline"
import { getSource, hasAdapter, listSources, resolveAdapter } from "../sources/registry"
import type { NormativeSourceRow } from "../sources/types"
import { complianceRoutes } from "./compliance"
import { submissionRoutes } from "./submissions"

// ─── Tipos ───────────────────────────────────────────────────────────────────

type AppVariables = {
	user: User
	role: AppRole
}

// ─── Schemas de input ─────────────────────────────────────────────────────────

const MessageBodySchema = z.object({
	message: z.string().min(1),
})

const SourceDocumentsQuerySchema = z.object({
	include_superseded: z.enum(["true", "false"]).optional(),
})

const RefreshBodySchema = z.object({
	/** Sem `apply`, a coleta só relata o que aconteceria — o padrão é não escrever. */
	apply: z.boolean().default(false),
	limit: z.number().int().positive().max(200).optional(),
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
	messages: Array<{ role: string; content: string }>
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

async function logQuery(session_id: string, user_id: string, query: string, state: any, latency_ms: number, langsmith_run_id: string | null = null) {
	await supabase.from("query_log").insert({
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
		const role = c.get("role") as AppRole
		const { message } = c.req.valid("json")

		if (role === "app_requisitante") {
			const { data: existing } = await supabase.from("query_log").select("user_id").eq("session_id", session_id).limit(1).single()
			if (existing && existing.user_id !== user.id) {
				return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
			}
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
		const role = c.get("role") as AppRole
		const { message } = c.req.valid("json")

		if (role === "app_requisitante") {
			const { data: existing } = await supabase.from("query_log").select("user_id").eq("session_id", session_id).limit(1).single()
			if (existing && existing.user_id !== user.id) {
				return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
			}
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
		const role = c.get("role") as AppRole

		if (role === "app_requisitante") {
			const { data: existing } = await supabase.from("query_log").select("user_id").eq("session_id", session_id).limit(1).single()
			if (existing && existing.user_id !== user.id) {
				return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
			}
		}

		const state = await graph.getState({ configurable: { thread_id: session_id } })
		const messages = (state.values?.messages ?? []).map((m: any) => ({
			role: m._getType?.() ?? "unknown",
			content: m.content,
		}))
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
			const report = await ingestSource({ sourceId: source.id, adapter: resolveAdapter(source), embed: embedDocuments, apply, limit })
			return c.json(report)
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
