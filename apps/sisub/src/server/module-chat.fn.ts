/**
 * @module module-chat.fn
 * Agentic chat session and message management with per-user + module + scope ownership enforcement.
 * CLIENT: getSupabaseAuthClient (JWT validation via requireUserId) + getSupabaseServerClient (service role, DB reads/writes).
 * TABLES: module_chat_session, module_chat_message.
 * Auth: all functions call requireUserId() — throws "Não autenticado" if JWT is invalid or missing.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseAuthClient, getSupabaseServerClient } from "@/lib/supabase.server"
import { CHAT_MODULES } from "@/types/domain/module-chat"

// The module_chat_* tables are created via migration but not yet in the generated
// Supabase types. We use `as any` for .from() calls until types are regenerated.
// biome-ignore lint/suspicious/noExplicitAny: tables not in generated types yet
type AnyFrom = any

// ── Auth ──────────────────────────────────────────────────────────────────────

async function requireUserId(): Promise<string> {
	const {
		data: { user },
	} = await getSupabaseAuthClient().auth.getUser()
	if (!user) throw new Error("Não autenticado")
	return user.id
}

// ── Sessions ─────────────────────────────────────────────────────────────────

/**
 * Lists up to 50 chat sessions for the authenticated user, filtered by module and optional scope.
 */
export const listModuleChatSessionsFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			module: z.enum(CHAT_MODULES),
			scopeId: z.number().int().positive().optional(),
		})
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const supabase = getSupabaseServerClient()

		let query = supabase
			.from("module_chat_session" as AnyFrom)
			.select("id, user_id, module, scope_id, title, created_at, updated_at")
			.eq("user_id", userId)
			.eq("module", data.module)
			.order("updated_at", { ascending: false })
			.limit(50)

		if (data.scopeId != null) {
			query = query.eq("scope_id", data.scopeId)
		} else {
			query = query.is("scope_id", null)
		}

		const { data: rows, error } = await query

		if (error) throw new Error(error.message)
		return rows ?? []
	})

/**
 * Creates a new chat session for the authenticated user in the given module + scope.
 */
export const createModuleChatSessionFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			title: z.string().min(1).max(200),
			module: z.enum(CHAT_MODULES),
			scopeId: z.number().int().positive().optional(),
		})
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const supabase = getSupabaseServerClient()

		const { data: row, error } = await supabase
			.from("module_chat_session" as AnyFrom)
			.insert({
				user_id: userId,
				title: data.title,
				module: data.module,
				scope_id: data.scopeId ?? null,
			})
			.select("id, user_id, module, scope_id, title, created_at, updated_at")
			.single()

		if (error) throw new Error(error.message)
		if (!row) throw new Error("Sessão não criada")
		return row
	})

/**
 * Renames a chat session scoped to the authenticated user.
 */
export const renameModuleChatSessionFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ sessionId: z.string().uuid(), title: z.string().min(1).max(200) }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const supabase = getSupabaseServerClient()

		const { error } = await supabase
			.from("module_chat_session" as AnyFrom)
			.update({ title: data.title })
			.eq("id", data.sessionId)
			.eq("user_id", userId)

		if (error) throw new Error(error.message)
	})

/**
 * Hard-deletes a chat session and its messages (cascade via FK).
 */
export const deleteModuleChatSessionFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ sessionId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const supabase = getSupabaseServerClient()

		const { error } = await supabase
			.from("module_chat_session" as AnyFrom)
			.delete()
			.eq("id", data.sessionId)
			.eq("user_id", userId)

		if (error) throw new Error(error.message)
	})

// ── Messages ─────────────────────────────────────────────────────────────────

/**
 * Fetches all messages for a session, verifying ownership in a single round-trip.
 */
export const getModuleChatMessagesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ sessionId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const supabase = getSupabaseServerClient()

		const { data: session, error } = await supabase
			.from("module_chat_session" as AnyFrom)
			.select("id, module_chat_message(id, session_id, role, content, tool_calls, tool_call_id, tool_name, tool_result, error, created_at)")
			.eq("id", data.sessionId)
			.eq("user_id", userId)
			.single()

		if (error || !session) throw new Error("Sessão não encontrada")

		const sessionRaw = session as unknown as Record<string, unknown>
		if (!Array.isArray(sessionRaw.module_chat_message)) throw new Error("Sessão não encontrada")

		// biome-ignore lint/suspicious/noExplicitAny: message rows from dynamic join
		const messages = sessionRaw.module_chat_message as any[]
		return messages.sort((a: { created_at: string }, b: { created_at: string }) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
	})

/**
 * Inserts a message into a session after verifying ownership.
 */
export const saveModuleChatMessageFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			sessionId: z.string().uuid(),
			role: z.enum(["user", "assistant", "tool"]),
			content: z.string(),
			toolCalls: z.any().optional(),
			toolCallId: z.string().optional(),
			toolName: z.string().optional(),
			toolResult: z.any().optional(),
			error: z.string().optional(),
		})
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const supabase = getSupabaseServerClient()

		// Verify session ownership
		const { data: session, error: sessionError } = await supabase
			.from("module_chat_session" as AnyFrom)
			.select("id")
			.eq("id", data.sessionId)
			.eq("user_id", userId)
			.single()

		if (sessionError || !session) throw new Error("Sessão não encontrada")

		const { data: row, error } = await supabase
			.from("module_chat_message" as AnyFrom)
			.insert({
				session_id: data.sessionId,
				role: data.role,
				content: data.content,
				tool_calls: data.toolCalls ?? null,
				tool_call_id: data.toolCallId ?? null,
				tool_name: data.toolName ?? null,
				tool_result: data.toolResult ?? null,
				error: data.error ?? null,
			})
			.select("id, session_id, role, content, tool_calls, tool_call_id, tool_name, tool_result, error, created_at")
			.single()

		if (error) throw new Error(error.message)
		if (!row) throw new Error("Mensagem não salva")
		return row
	})
