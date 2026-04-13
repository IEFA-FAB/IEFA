import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseAuthClient, getSupabaseServerClient } from "@/lib/supabase.server"

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireUserId() {
	const auth = getSupabaseAuthClient()
	const {
		data: { user },
	} = await auth.auth.getUser()
	if (!user) throw new Error("Não autenticado")
	return user.id
}

function db() {
	return getSupabaseServerClient()
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export const listChatSessionsFn = createServerFn({ method: "GET" }).handler(async () => {
	const userId = await requireUserId()
	const { data, error } = await db()
		.from("analytics_chat_session")
		.select("id, user_id, title, created_at, updated_at")
		.eq("user_id", userId)
		.order("updated_at", { ascending: false })
		.limit(50)

	if (error) throw new Error(error.message)
	return data ?? []
})

export const createChatSessionFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ title: z.string().min(1).max(200) }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const { data: row, error } = await db()
			.from("analytics_chat_session")
			.insert({ user_id: userId, title: data.title })
			.select("id, user_id, title, created_at, updated_at")
			.single()

		if (error) throw new Error(error.message)
		if (!row) throw new Error("Sessão não criada")
		return row
	})

export const renameChatSessionFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ sessionId: z.string().uuid(), title: z.string().min(1).max(200) }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const { error } = await db().from("analytics_chat_session").update({ title: data.title }).eq("id", data.sessionId).eq("user_id", userId)

		if (error) throw new Error(error.message)
	})

export const deleteChatSessionFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ sessionId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const { error } = await db().from("analytics_chat_session").delete().eq("id", data.sessionId).eq("user_id", userId)

		if (error) throw new Error(error.message)
	})

// ── Messages ─────────────────────────────────────────────────────────────────

export const getChatMessagesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ sessionId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()

		// Verify session ownership
		const { data: session, error: sessionError } = await db()
			.from("analytics_chat_session")
			.select("id")
			.eq("id", data.sessionId)
			.eq("user_id", userId)
			.single()

		if (sessionError || !session) throw new Error("Sessão não encontrada")

		const { data: messages, error } = await db()
			.from("analytics_chat_message")
			.select("id, session_id, role, content, chart, error, chart_type_override, created_at")
			.eq("session_id", data.sessionId)
			.order("created_at", { ascending: true })

		if (error) throw new Error(error.message)
		return messages ?? []
	})

const CHART_TYPES = ["bar", "line", "area", "pie", "table"] as const

export const saveChatMessageFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			sessionId: z.string().uuid(),
			role: z.enum(["user", "assistant"]),
			content: z.string(),
			chart: z.any().optional(),
			chartTypeOverride: z.enum(CHART_TYPES).optional(),
			error: z.string().optional(),
		})
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId()

		// Verify ownership
		const { data: session, error: sessionError } = await db()
			.from("analytics_chat_session")
			.select("id")
			.eq("id", data.sessionId)
			.eq("user_id", userId)
			.single()

		if (sessionError || !session) throw new Error("Sessão não encontrada")

		const { data: row, error } = await db()
			.from("analytics_chat_message")
			.insert({
				session_id: data.sessionId,
				role: data.role,
				content: data.content,
				chart: data.chart ?? null,
				chart_type_override: data.chartTypeOverride ?? null,
				error: data.error ?? null,
			})
			.select("id, session_id, role, content, chart, chart_type_override, error, created_at")
			.single()

		if (error) throw new Error(error.message)
		if (!row) throw new Error("Mensagem não salva")
		return row
	})

export const updateMessageChartTypeFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			messageId: z.string().uuid(),
			chartTypeOverride: z.enum(CHART_TYPES),
		})
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId()

		// Verify ownership via session join
		const { data: msg, error: msgError } = await db()
			.from("analytics_chat_message")
			.select("id, session_id, analytics_chat_session!inner(user_id)")
			.eq("id", data.messageId)
			.single()

		if (msgError || !msg) throw new Error("Mensagem não encontrada")

		type SessionJoin = { user_id: string }
		const session = msg.analytics_chat_session as unknown as SessionJoin
		if (session.user_id !== userId) throw new Error("Acesso negado")

		const { error } = await db().from("analytics_chat_message").update({ chart_type_override: data.chartTypeOverride }).eq("id", data.messageId)

		if (error) throw new Error(error.message)
	})
