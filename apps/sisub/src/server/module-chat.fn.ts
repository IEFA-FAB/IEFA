/**
 * @module module-chat.fn
 * Wrapper fino sobre as operations de histórico do chat agêntico em `@iefa/sisub-domain`
 * (Drizzle). TABLES: module_chat_session, module_chat_message.
 *
 * Auth: toda fn resolve o `UserContext` da sessão; a autorização é POSSE — a operation filtra
 * por `user_id` em toda query, inclusive nas de mensagem. Nenhum endpoint aceita `userId` no
 * payload.
 *
 * As tabelas `module_chat_*` existem no schema Drizzle gerado (`moduleChatSessionInKitchen`,
 * `moduleChatMessageInKitchen`), então o escape de tipo que este arquivo carregava em cada
 * `.from()` — herdado de quando elas não estavam nos tipos Supabase gerados — morreu junto com
 * o acesso PostgREST. Ele desligava a checagem de coluna E de payload: campo escrito errado
 * passava calado.
 * @domain app
 * @migration done
 */

import {
	ChatSessionRefSchema,
	CreateModuleChatSessionSchema,
	createModuleChatSession,
	deleteModuleChatSession,
	ListModuleChatSessionsSchema,
	listModuleChatMessages,
	listModuleChatSessions,
	type ModuleChatMessageRow,
	type ModuleChatSessionRow,
	RenameChatSessionSchema,
	renameModuleChatSession,
	SaveModuleChatMessageSchema,
	saveModuleChatMessage,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

// ── Sessions ─────────────────────────────────────────────────────────────────

/** Até 50 sessões do usuário no módulo. Sem `scopeId` = sessões SEM escopo (`scope_id IS NULL`). */
export const listModuleChatSessionsFn = createServerFn({ method: "GET" })
	.validator(ListModuleChatSessionsSchema)
	.handler(async ({ data }): Promise<ModuleChatSessionRow[]> => {
		const ctx = await requireAuth()
		return listModuleChatSessions(getDb(), ctx, data).catch(handleDomainError)
	})

export const createModuleChatSessionFn = createServerFn({ method: "POST" })
	.validator(CreateModuleChatSessionSchema)
	.handler(async ({ data }): Promise<ModuleChatSessionRow> => {
		const ctx = await requireAuth()
		return createModuleChatSession(getDb(), ctx, data).catch(handleDomainError)
	})

export const renameModuleChatSessionFn = createServerFn({ method: "POST" })
	.validator(RenameChatSessionSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return renameModuleChatSession(getDb(), ctx, data).catch(handleDomainError)
	})

/** Exclusão definitiva da sessão; as mensagens caem por cascade. */
export const deleteModuleChatSessionFn = createServerFn({ method: "POST" })
	.validator(ChatSessionRefSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return deleteModuleChatSession(getDb(), ctx, data).catch(handleDomainError)
	})

// ── Messages ─────────────────────────────────────────────────────────────────

/** Mensagens em ordem cronológica. Sessão inexistente ou de terceiro → 404. */
export const getModuleChatMessagesFn = createServerFn({ method: "GET" })
	.validator(ChatSessionRefSchema)
	.handler(async ({ data }): Promise<ModuleChatMessageRow[]> => {
		const ctx = await requireAuth()
		return listModuleChatMessages(getDb(), ctx, data).catch(handleDomainError)
	})

export const saveModuleChatMessageFn = createServerFn({ method: "POST" })
	.validator(SaveModuleChatMessageSchema)
	.handler(async ({ data }): Promise<ModuleChatMessageRow> => {
		const ctx = await requireAuth()
		return saveModuleChatMessage(getDb(), ctx, data).catch(handleDomainError)
	})
