import type { Json } from "@iefa/database"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseAuthClient, getSupabaseServerClient } from "@/lib/supabase.server"
import { CHART_TYPES } from "@/types/domain/analytics-chat"

// ── Auth ──────────────────────────────────────────────────────────────────────

async function requireUserId(): Promise<string> {
	const {
		data: { user },
	} = await getSupabaseAuthClient().auth.getUser()
	if (!user) throw new Error("Não autenticado")
	return user.id
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export const listChatSessionsFn = createServerFn({ method: "GET" }).handler(async () => {
	const userId = await requireUserId()
	const supabase = getSupabaseServerClient()

	const { data, error } = await supabase
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
		const supabase = getSupabaseServerClient()

		const { data: row, error } = await supabase
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
		const supabase = getSupabaseServerClient()

		const { error } = await supabase.from("analytics_chat_session").update({ title: data.title }).eq("id", data.sessionId).eq("user_id", userId)

		if (error) throw new Error(error.message)
	})

export const deleteChatSessionFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ sessionId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const supabase = getSupabaseServerClient()

		const { error } = await supabase.from("analytics_chat_session").delete().eq("id", data.sessionId).eq("user_id", userId)

		if (error) throw new Error(error.message)
	})

// ── Messages ─────────────────────────────────────────────────────────────────

type MessageRow = {
	id: string
	session_id: string
	role: string
	content: string
	chart: Json | null
	error: string | null
	chart_type_override: string | null
	created_at: string
}

export const getChatMessagesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ sessionId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const supabase = getSupabaseServerClient()

		// Single round-trip: ownership check (session.user_id) + messages via nested select.
		// PostgREST resolves the FK relationship server-side; we cast the nested array
		// manually because the reverse relationship is not emitted in the generated TS types.
		const { data: session, error } = await supabase
			.from("analytics_chat_session")
			.select("id, analytics_chat_message(id, session_id, role, content, chart, error, chart_type_override, created_at)")
			.eq("id", data.sessionId)
			.eq("user_id", userId)
			.single()

		if (error || !session) throw new Error("Sessão não encontrada")

		const sessionRaw = session as Record<string, unknown>

		// Guard: if PostgREST doesn't expose the reverse FK (analytics_chat_session →
		// analytics_chat_message), the key will be absent from the response rather than [].
		// Fail loudly instead of returning an empty array that looks like "no messages".
		if (!Array.isArray(sessionRaw.analytics_chat_message)) throw new Error("Sessão não encontrada")

		const messages = sessionRaw.analytics_chat_message as MessageRow[]

		// Sort ascending — nested select order is not guaranteed
		return messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
	})

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
		const supabase = getSupabaseServerClient()

		// Verify session ownership — single client reused for the insert below
		const { data: session, error: sessionError } = await supabase
			.from("analytics_chat_session")
			.select("id")
			.eq("id", data.sessionId)
			.eq("user_id", userId)
			.single()

		if (sessionError || !session) throw new Error("Sessão não encontrada")

		const { data: row, error } = await supabase
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
		const supabase = getSupabaseServerClient()

		// Verify the message belongs to a session owned by this user (FK: message → session)
		const { data: msg, error: lookupError } = await supabase
			.from("analytics_chat_message")
			.select("id, analytics_chat_session!inner(user_id)")
			.eq("id", data.messageId)
			.single()

		if (lookupError || !msg) throw new Error("Mensagem não encontrada")

		const owner = (msg.analytics_chat_session as unknown as { user_id: string }).user_id
		if (owner !== userId) throw new Error("Acesso negado")

		const { error } = await supabase.from("analytics_chat_message").update({ chart_type_override: data.chartTypeOverride }).eq("id", data.messageId)

		if (error) throw new Error(error.message)
	})
