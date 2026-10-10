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
import { setResponseStatus } from "@tanstack/react-start/server"
import { requireAuth } from "@/lib/auth.server"
import { CHAT_HISTORY_WRITE_LIMITER } from "@/lib/chat-history-rate-limit"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

// ── Sessions ─────────────────────────────────────────────────────────────────

/** Até 50 sessões do usuário autenticado, mais recentes primeiro. */
export const listChatSessionsFn = createServerFn({ method: "GET" }).handler(async (): Promise<AnalyticsChatSessionRow[]> => {
	const ctx = await requireAuth()
	return listAnalyticsChatSessions(getDb(), ctx).catch(handleDomainError)
})

export const createChatSessionFn = createServerFn({ method: "POST" })
	.validator(CreateAnalyticsChatSessionSchema)
	.handler(requireAuthThenRun(createAnalyticsChatSession))

export const renameChatSessionFn = createServerFn({ method: "POST" }).validator(RenameChatSessionSchema).handler(requireAuthThenRun(renameAnalyticsChatSession))

/** Exclusão definitiva da sessão; as mensagens caem por cascade. */
export const deleteChatSessionFn = createServerFn({ method: "POST" }).validator(ChatSessionRefSchema).handler(requireAuthThenRun(deleteAnalyticsChatSession))

// ── Messages ─────────────────────────────────────────────────────────────────

/** Mensagens em ordem cronológica. Sessão inexistente ou de terceiro → 404. */
export const getChatMessagesFn = createServerFn({ method: "GET" }).validator(ChatSessionRefSchema).handler(requireAuthThenRun(listAnalyticsChatMessages))

export const saveChatMessageFn = createServerFn({ method: "POST" })
	.validator(SaveAnalyticsChatMessageSchema)
	.handler(async ({ data }): Promise<AnalyticsChatMessageRow> => {
		const ctx = await requireAuth()
		// Teto por usuário: o tamanho de cada linha o schema já limita; isto limita quantas.
		const verdict = CHAT_HISTORY_WRITE_LIMITER.admit(ctx.userId)
		if (!verdict.allowed) {
			setResponseStatus(429)
			throw new Error(verdict.message)
		}
		return saveAnalyticsChatMessage(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateMessageChartTypeFn = createServerFn({ method: "POST" })
	.validator(UpdateMessageChartTypeSchema)
	.handler(requireAuthThenRun(updateAnalyticsMessageChartType))
