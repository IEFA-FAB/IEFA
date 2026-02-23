import { HumanMessage } from "@langchain/core/messages"
import type { User } from "@supabase/supabase-js"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { v4 as uuid } from "uuid"
import { supabase } from "../db/supabase"
import { GRAPH_INVOKE_CONFIG, graph } from "../graph"
import type { AppRole } from "../middleware/auth"
import { authMiddleware } from "../middleware/auth"

type AppVariables = {
	user: User
	role: AppRole
}

const app = new Hono<{ Variables: AppVariables }>()

app.use("/api/v1/*", authMiddleware)

app.post("/api/v1/sessions", async (c) => {
	const user = c.get("user")
	const session_id = uuid()
	return c.json(
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

app.post("/api/v1/sessions/:session_id/messages", async (c) => {
	const acceptHeader = c.req.header("Accept") ?? ""
	const isSSE = acceptHeader.includes("text/event-stream")
	const session_id = c.req.param("session_id")
	const user = c.get("user")
	const role = c.get("role") as AppRole
	const body = await c.req.json<{ message: string }>()

	if (!body?.message) {
		return c.json({ error: "Bad Request", code: "MISSING_MESSAGE" }, 400)
	}

	if (role === "app_requisitante") {
		const { data: existing } = await supabase
			.from("query_logs")
			.select("user_id")
			.eq("session_id", session_id)
			.limit(1)
			.single()
		if (existing && existing.user_id !== user.id) {
			return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		}
	}

	const input = {
		messages: [new HumanMessage(body.message)],
		session_id,
		user_id: user.id,
	}
	const config = { configurable: { thread_id: session_id } }

	if (isSSE) {
		return streamSSE(c, async (stream) => {
			const timeoutId = setTimeout(async () => {
				await stream.writeSSE({
					event: "error",
					data: JSON.stringify({ code: "CONNECTION_TIMEOUT" }),
				})
				stream.abort()
			}, 60_000)
			try {
				const gs = await graph.stream(input, {
					...config,
					...GRAPH_INVOKE_CONFIG,
					streamMode: "updates",
				})
				for await (const chunk of gs) {
					const node = Object.keys(chunk)[0]
					await stream.writeSSE({
						event: "status",
						data: JSON.stringify({ node, iteration: (chunk as any)[node]?.retrieval_iterations }),
					})
				}
				const finalState = await graph.getState(config)
				clearTimeout(timeoutId)
				await stream.writeSSE({
					event: "complete",
					data: JSON.stringify(buildResponse(session_id, finalState.values)),
				})
			} catch {
				clearTimeout(timeoutId)
				await stream.writeSSE({ event: "error", data: JSON.stringify({ code: "INTERNAL_ERROR" }) })
			}
		})
	}

	const startMs = Date.now()
	const result = await graph.invoke(input, { ...config, ...GRAPH_INVOKE_CONFIG })
	const latency_ms = Date.now() - startMs
	await logQuery(session_id, user.id, body.message, result, latency_ms)
	return c.json(buildResponse(session_id, result))
})

app.get("/api/v1/sessions/:session_id/messages", async (c) => {
	const session_id = c.req.param("session_id")
	const user = c.get("user")
	const role = c.get("role") as AppRole

	if (role === "app_requisitante") {
		const { data: existing } = await supabase
			.from("query_logs")
			.select("user_id")
			.eq("session_id", session_id)
			.limit(1)
			.single()
		if (existing && existing.user_id !== user.id) {
			return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		}
	}

	const state = await graph.getState({ configurable: { thread_id: session_id } })
	const messages = (state.values?.messages ?? []).map((m: any) => ({
		role: m._getType?.() ?? "unknown",
		content: m.content,
	}))
	return c.json({
		session_id,
		messages,
		_links: { self: { href: `/api/v1/sessions/${session_id}/messages` } },
	})
})

app.get("/api/v1/chunks/:id", async (c) => {
	const id = c.req.param("id")
	const { data, error } = await supabase
		.from("document_chunks")
		.select(
			"id, content, chapter, article, section, chunk_index, token_count, metadata, document_id"
		)
		.eq("id", id)
		.single()
	if (error || !data) {
		return c.json({ error: "Not Found", code: "CHUNK_NOT_FOUND" }, 404)
	}
	return c.json({
		...data,
		_links: {
			self: { href: `/api/v1/chunks/${id}` },
			document: { href: `/api/v1/documents/${data.document_id}` },
		},
	})
})

function buildResponse(session_id: string, state: any) {
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

async function logQuery(
	session_id: string,
	user_id: string,
	query: string,
	state: any,
	latency_ms: number
) {
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
		langsmith_run_id: null,
	})
}

export default app
