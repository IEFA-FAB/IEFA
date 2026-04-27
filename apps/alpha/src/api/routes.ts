import { zValidator } from "@hono/zod-validator"
import { createRunCollector } from "@iefa/alpha-client/tracer"
import { HumanMessage } from "@langchain/core/messages"
import type { User } from "@supabase/supabase-js"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { v4 as uuid } from "uuid"
import { z } from "zod"
import { supabase } from "../db/supabase"
import { GRAPH_INVOKE_CONFIG, graph } from "../graph"
import type { AppRole } from "../middleware/auth"
import { authMiddleware } from "../middleware/auth"

// ─── Tipos ───────────────────────────────────────────────────────────────────

type AppVariables = {
	user: User
	role: AppRole
}

// ─── Schemas de input ─────────────────────────────────────────────────────────

const MessageBodySchema = z.object({
	message: z.string().min(1),
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
	await supabase.from("query_logs").insert({
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

const app = new Hono<{ Variables: AppVariables }>()
	.use("/api/v1/*", authMiddleware)

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
			const { data: existing } = await supabase.from("query_logs").select("user_id").eq("session_id", session_id).limit(1).single()
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
			const { data: existing } = await supabase.from("query_logs").select("user_id").eq("session_id", session_id).limit(1).single()
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
			const { data: existing } = await supabase.from("query_logs").select("user_id").eq("session_id", session_id).limit(1).single()
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
			.from("document_chunks")
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

export default app
export type AppRoutes = typeof app
