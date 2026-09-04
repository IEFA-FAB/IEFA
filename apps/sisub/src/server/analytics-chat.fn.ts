/**
 * @module analytics-chat.fn
 * Wrapper fino sobre as operations de histórico do chat de analytics em `@iefa/sisub-domain`
 * (Drizzle). TABLES: analytics_chat_session, analytics_chat_message.
 *
 * Auth: toda fn resolve o `UserContext` da sessão; a autorização é POSSE — a operation filtra
 * por `user_id` em toda query, inclusive nas de mensagem. Nenhum endpoint aceita `userId` no
 * payload.
 * @domain app
 * @migration done
 */

import {
	type AnalyticsChatMessageRow,
	type AnalyticsChatSessionRow,
	ChatSessionRefSchema,
	CreateAnalyticsChatSessionSchema,
	createAnalyticsChatSession,
	deleteAnalyticsChatSession,
	listAnalyticsChatMessages,
	listAnalyticsChatSessions,
	RenameChatSessionSchema,
	renameAnalyticsChatSession,
	SaveAnalyticsChatMessageSchema,
	saveAnalyticsChatMessage,
	UpdateMessageChartTypeSchema,
	updateAnalyticsMessageChartType,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

// ── Sessions ─────────────────────────────────────────────────────────────────

/** Até 50 sessões do usuário autenticado, mais recentes primeiro. */
export const listChatSessionsFn = createServerFn({ method: "GET" }).handler(async (): Promise<AnalyticsChatSessionRow[]> => {
	const ctx = await requireAuth()
	return listAnalyticsChatSessions(getDb(), ctx).catch(handleDomainError)
})

export const createChatSessionFn = createServerFn({ method: "POST" })
	.validator(CreateAnalyticsChatSessionSchema)
	.handler(async ({ data }): Promise<AnalyticsChatSessionRow> => {
		const ctx = await requireAuth()
		return createAnalyticsChatSession(getDb(), ctx, data).catch(handleDomainError)
	})

export const renameChatSessionFn = createServerFn({ method: "POST" })
	.validator(RenameChatSessionSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return renameAnalyticsChatSession(getDb(), ctx, data).catch(handleDomainError)
	})

/** Exclusão definitiva da sessão; as mensagens caem por cascade. */
export const deleteChatSessionFn = createServerFn({ method: "POST" })
	.validator(ChatSessionRefSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return deleteAnalyticsChatSession(getDb(), ctx, data).catch(handleDomainError)
	})

// ── Messages ─────────────────────────────────────────────────────────────────

/** Mensagens em ordem cronológica. Sessão inexistente ou de terceiro → 404. */
export const getChatMessagesFn = createServerFn({ method: "GET" })
	.validator(ChatSessionRefSchema)
	.handler(async ({ data }): Promise<AnalyticsChatMessageRow[]> => {
		const ctx = await requireAuth()
		return listAnalyticsChatMessages(getDb(), ctx, data).catch(handleDomainError)
	})

export const saveChatMessageFn = createServerFn({ method: "POST" })
	.validator(SaveAnalyticsChatMessageSchema)
	.handler(async ({ data }): Promise<AnalyticsChatMessageRow> => {
		const ctx = await requireAuth()
		return saveAnalyticsChatMessage(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateMessageChartTypeFn = createServerFn({ method: "POST" })
	.validator(UpdateMessageChartTypeSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return updateAnalyticsMessageChartType(getDb(), ctx, data).catch(handleDomainError)
	})
