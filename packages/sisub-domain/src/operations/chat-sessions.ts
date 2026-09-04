/**
 * Histórico dos chats persistidos — analytics (`analytics_chat_*`) e agêntico por módulo
 * (`module_chat_*`). Camada de query Drizzle; substitui o acesso PostgREST direto de
 * `analytics-chat.fn.ts` e `module-chat.fn.ts`.
 *
 * ## A autorização aqui é POSSE, não módulo PBAC
 *
 * Sessão de chat é dado pessoal: não existe nível que autorize ler a conversa de outro
 * usuário, então nenhum `requirePermission` cabe. O guard é o `ctx.userId` no WHERE, e ele
 * é obrigatório em TODA query deste arquivo — inclusive nas de mensagem, onde o dono está a
 * um FK de distância. Com Drizzle a conexão usa o role do projeto e RLS não se aplica: um
 * `where id = ?` sem o dono devolveria a conversa alheia inteira (IDOR).
 *
 * O dono sai SEMPRE do contexto e nunca do input — não há campo `userId` em schema nenhum
 * de `chat.ts` por isso.
 *
 * ## Por que analytics e módulo não viraram um código só
 *
 * Sessão e título coincidem (e o que coincide está fatorado em `chat.ts`), mas a mensagem
 * diverge: uma carrega gráfico, a outra chamada de ferramenta. Uma função genérica sobre as
 * duas tabelas exigiria projeção dinâmica e perderia o tipo de retorno — o custo passa o de
 * repetir seis linhas de WHERE.
 */

import type { Json } from "@iefa/database"
import {
	analyticsChatMessageInKitchen,
	analyticsChatSessionInKitchen,
	moduleChatMessageInKitchen,
	moduleChatSessionInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm"
import type {
	ChatSessionRef,
	CreateAnalyticsChatSession,
	CreateModuleChatSession,
	ListModuleChatSessions,
	RenameChatSession,
	SaveAnalyticsChatMessage,
	SaveModuleChatMessage,
	UpdateMessageChartType,
} from "../schemas/chat.ts"
import type { UserContext } from "../types/context.ts"
import { NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, runQuery } from "../utils/index.ts"

/** Teto do histórico exibido na barra lateral — preservado da versão PostgREST. */
const SESSION_LIST_LIMIT = 50

/** Cliente de transação Drizzle (o `tx` passado ao callback de `db.transaction`). */
type SisubTx = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]

export interface AnalyticsChatSessionRow {
	id: string
	user_id: string
	title: string
	created_at: string
	updated_at: string
}

export interface AnalyticsChatMessageRow {
	id: string
	session_id: string
	role: string
	content: string
	chart: Json | null
	error: string | null
	chart_type_override: string | null
	created_at: string
}

export interface ModuleChatSessionRow {
	id: string
	user_id: string
	module: string
	scope_id: number | null
	title: string
	created_at: string
	updated_at: string
}

export interface ModuleChatMessageRow {
	id: string
	session_id: string
	role: string
	content: string
	tool_calls: Json | null
	tool_call_id: string | null
	tool_name: string | null
	tool_result: Json | null
	error: string | null
	created_at: string
}

const ANALYTICS_SESSION_COLS = {
	id: analyticsChatSessionInKitchen.id,
	user_id: analyticsChatSessionInKitchen.userId,
	title: analyticsChatSessionInKitchen.title,
	created_at: analyticsChatSessionInKitchen.createdAt,
	updated_at: analyticsChatSessionInKitchen.updatedAt,
} as const

const ANALYTICS_MESSAGE_COLS = {
	id: analyticsChatMessageInKitchen.id,
	session_id: analyticsChatMessageInKitchen.sessionId,
	role: analyticsChatMessageInKitchen.role,
	content: analyticsChatMessageInKitchen.content,
	chart: analyticsChatMessageInKitchen.chart,
	error: analyticsChatMessageInKitchen.error,
	chart_type_override: analyticsChatMessageInKitchen.chartTypeOverride,
	created_at: analyticsChatMessageInKitchen.createdAt,
} as const

const MODULE_SESSION_COLS = {
	id: moduleChatSessionInKitchen.id,
	user_id: moduleChatSessionInKitchen.userId,
	module: moduleChatSessionInKitchen.module,
	scope_id: moduleChatSessionInKitchen.scopeId,
	title: moduleChatSessionInKitchen.title,
	created_at: moduleChatSessionInKitchen.createdAt,
	updated_at: moduleChatSessionInKitchen.updatedAt,
} as const

const MODULE_MESSAGE_COLS = {
	id: moduleChatMessageInKitchen.id,
	session_id: moduleChatMessageInKitchen.sessionId,
	role: moduleChatMessageInKitchen.role,
	content: moduleChatMessageInKitchen.content,
	tool_calls: moduleChatMessageInKitchen.toolCalls,
	tool_call_id: moduleChatMessageInKitchen.toolCallId,
	tool_name: moduleChatMessageInKitchen.toolName,
	tool_result: moduleChatMessageInKitchen.toolResult,
	error: moduleChatMessageInKitchen.error,
	created_at: moduleChatMessageInKitchen.createdAt,
} as const

/**
 * Predicado de posse: a sessão E o dono, sempre juntos.
 *
 * Existe como função para que esquecer o `user_id` seja visível na revisão — o WHERE só com
 * `id` compila igual e devolve a conversa de qualquer um.
 */
function ownsAnalyticsSession(userId: string, sessionId: string) {
	return and(eq(analyticsChatSessionInKitchen.id, sessionId), eq(analyticsChatSessionInKitchen.userId, userId))
}

function ownsModuleSession(userId: string, sessionId: string) {
	return and(eq(moduleChatSessionInKitchen.id, sessionId), eq(moduleChatSessionInKitchen.userId, userId))
}

// ── Chat de analytics: sessões ───────────────────────────────────────────────

export async function listAnalyticsChatSessions(db: SisubDb, ctx: UserContext): Promise<AnalyticsChatSessionRow[]> {
	return runQuery("QUERY_FAILED", () =>
		db
			.select(ANALYTICS_SESSION_COLS)
			.from(analyticsChatSessionInKitchen)
			.where(eq(analyticsChatSessionInKitchen.userId, ctx.userId))
			.orderBy(desc(analyticsChatSessionInKitchen.updatedAt))
			.limit(SESSION_LIST_LIMIT)
	)
}

export async function createAnalyticsChatSession(db: SisubDb, ctx: UserContext, input: CreateAnalyticsChatSession): Promise<AnalyticsChatSessionRow> {
	return insertOneOrFail("INSERT_FAILED", "Sessão não criada", () =>
		db.insert(analyticsChatSessionInKitchen).values({ userId: ctx.userId, title: input.title }).returning(ANALYTICS_SESSION_COLS)
	)
}

/**
 * Renomeia a sessão do próprio usuário.
 *
 * `updated_at` NÃO é tocado: quem ordena a barra lateral é a atividade da conversa, e o
 * trigger `trg_touch_chat_session` já cuida disso na chegada de mensagem. Renomear não é
 * conversar — carimbar aqui empurraria uma sessão antiga para o topo.
 */
export async function renameAnalyticsChatSession(db: SisubDb, ctx: UserContext, input: RenameChatSession): Promise<void> {
	const rows = await runQuery("UPDATE_FAILED", () =>
		db
			.update(analyticsChatSessionInKitchen)
			.set({ title: input.title })
			.where(ownsAnalyticsSession(ctx.userId, input.sessionId))
			.returning({ id: analyticsChatSessionInKitchen.id })
	)
	if (rows.length === 0) throw new NotFoundError("analytics_chat_session", input.sessionId)
}

/** Exclusão definitiva; as mensagens caem por `ON DELETE CASCADE`. */
export async function deleteAnalyticsChatSession(db: SisubDb, ctx: UserContext, input: ChatSessionRef): Promise<void> {
	const rows = await runQuery("DELETE_FAILED", () =>
		db.delete(analyticsChatSessionInKitchen).where(ownsAnalyticsSession(ctx.userId, input.sessionId)).returning({ id: analyticsChatSessionInKitchen.id })
	)
	if (rows.length === 0) throw new NotFoundError("analytics_chat_session", input.sessionId)
}

// ── Chat de analytics: mensagens ─────────────────────────────────────────────

/**
 * Mensagens da sessão, em ordem cronológica, com a posse checada na MESMA query.
 *
 * `leftJoin` a partir da sessão, e não `select` direto na mensagem: sem linha nenhuma a
 * sessão não existe ou não é do usuário (404); com linha de mensagem nula ela existe e está
 * vazia (`[]`). Um `select` na tabela de mensagem confundiria os dois casos e devolveria
 * array vazio para sessão alheia — estado vazio que mente sobre a negativa.
 */
export async function listAnalyticsChatMessages(db: SisubDb, ctx: UserContext, input: ChatSessionRef): Promise<AnalyticsChatMessageRow[]> {
	const rows = await runQuery("QUERY_FAILED", () =>
		db
			.select(ANALYTICS_MESSAGE_COLS)
			.from(analyticsChatSessionInKitchen)
			.leftJoin(analyticsChatMessageInKitchen, eq(analyticsChatMessageInKitchen.sessionId, analyticsChatSessionInKitchen.id))
			.where(ownsAnalyticsSession(ctx.userId, input.sessionId))
			.orderBy(asc(analyticsChatMessageInKitchen.createdAt))
	)

	if (rows.length === 0) throw new NotFoundError("analytics_chat_session", input.sessionId)

	// O join deixa as colunas da mensagem anuláveis; a linha órfã é a sessão sem mensagem.
	return rows
		.filter((r): r is AnalyticsChatMessageRow => r.id !== null)
		.map((r) => ({
			id: r.id,
			session_id: r.session_id,
			role: r.role,
			content: r.content,
			chart: r.chart as Json | null,
			error: r.error,
			chart_type_override: r.chart_type_override,
			created_at: r.created_at,
		}))
}

/** Posse da sessão dentro da transação de escrita — falha antes de gravar qualquer mensagem. */
async function assertOwnsAnalyticsSession(tx: SisubTx, userId: string, sessionId: string): Promise<void> {
	const rows = await tx
		.select({ id: analyticsChatSessionInKitchen.id })
		.from(analyticsChatSessionInKitchen)
		.where(ownsAnalyticsSession(userId, sessionId))
		.limit(1)
	if (rows.length === 0) throw new NotFoundError("analytics_chat_session", sessionId)
}

/**
 * Grava uma mensagem na sessão do próprio usuário.
 *
 * Checagem de posse e INSERT na mesma transação: separadas, a sessão pode ser apagada entre
 * as duas e o INSERT falharia com violação de FK crua em vez do 404 correto.
 */
export async function saveAnalyticsChatMessage(db: SisubDb, ctx: UserContext, input: SaveAnalyticsChatMessage): Promise<AnalyticsChatMessageRow> {
	return runQuery("INSERT_FAILED", () =>
		db.transaction(async (tx) => {
			await assertOwnsAnalyticsSession(tx, ctx.userId, input.sessionId)

			const [row] = await tx
				.insert(analyticsChatMessageInKitchen)
				.values({
					sessionId: input.sessionId,
					role: input.role,
					content: input.content,
					chart: input.chart ?? null,
					chartTypeOverride: input.chartTypeOverride ?? null,
					error: input.error ?? null,
					model: input.model ?? null,
					latencyMs: input.latencyMs ?? null,
					langsmithRunId: input.langsmithRunId ?? null,
					inputTokens: input.inputTokens ?? null,
					outputTokens: input.outputTokens ?? null,
				})
				.returning(ANALYTICS_MESSAGE_COLS)

			if (!row) throw new NotFoundError("analytics_chat_message", input.sessionId)
			// `chart` é jsonb: o drizzle o tipa como `unknown`, mas o contrato (e o
			// serializador da server fn) exige JSON. O que entra é `input.chart`, já
			// validado pelo schema.
			return { ...row, chart: row.chart as Json | null }
		})
	)
}

/**
 * Troca o tipo de gráfico escolhido pelo usuário para uma mensagem.
 *
 * A posse entra como subconsulta no próprio UPDATE — a mensagem só casa quando a sessão dela
 * é do usuário. Ler o dono antes e escrever depois abriria janela para a mensagem ser
 * reparentada no meio, e o UPDATE cairia numa conversa alheia.
 *
 * Mensagem inexistente e mensagem de terceiro dão o MESMO 404: distinguir contaria ao
 * chamador que o id existe.
 */
export async function updateAnalyticsMessageChartType(db: SisubDb, ctx: UserContext, input: UpdateMessageChartType): Promise<void> {
	const ownedMessages = db
		.select({ id: analyticsChatMessageInKitchen.id })
		.from(analyticsChatMessageInKitchen)
		.innerJoin(analyticsChatSessionInKitchen, eq(analyticsChatSessionInKitchen.id, analyticsChatMessageInKitchen.sessionId))
		.where(and(eq(analyticsChatMessageInKitchen.id, input.messageId), eq(analyticsChatSessionInKitchen.userId, ctx.userId)))

	const rows = await runQuery("UPDATE_FAILED", () =>
		db
			.update(analyticsChatMessageInKitchen)
			.set({ chartTypeOverride: input.chartTypeOverride })
			.where(inArray(analyticsChatMessageInKitchen.id, ownedMessages))
			.returning({ id: analyticsChatMessageInKitchen.id })
	)
	if (rows.length === 0) throw new NotFoundError("analytics_chat_message", input.messageId)
}

// ── Chat agêntico por módulo: sessões ────────────────────────────────────────

/**
 * Sessões do usuário no módulo. `scopeId` ausente significa sessão SEM escopo
 * (`scope_id IS NULL`), não "qualquer escopo": trocar por "qualquer" misturaria a conversa
 * global com a de cada cozinha na mesma lista.
 */
export async function listModuleChatSessions(db: SisubDb, ctx: UserContext, input: ListModuleChatSessions): Promise<ModuleChatSessionRow[]> {
	const scopeFilter = input.scopeId != null ? eq(moduleChatSessionInKitchen.scopeId, input.scopeId) : isNull(moduleChatSessionInKitchen.scopeId)

	return runQuery("QUERY_FAILED", () =>
		db
			.select(MODULE_SESSION_COLS)
			.from(moduleChatSessionInKitchen)
			.where(and(eq(moduleChatSessionInKitchen.userId, ctx.userId), eq(moduleChatSessionInKitchen.module, input.module), scopeFilter))
			.orderBy(desc(moduleChatSessionInKitchen.updatedAt))
			.limit(SESSION_LIST_LIMIT)
	)
}

export async function createModuleChatSession(db: SisubDb, ctx: UserContext, input: CreateModuleChatSession): Promise<ModuleChatSessionRow> {
	return insertOneOrFail("INSERT_FAILED", "Sessão não criada", () =>
		db
			.insert(moduleChatSessionInKitchen)
			.values({ userId: ctx.userId, title: input.title, module: input.module, scopeId: input.scopeId ?? null })
			.returning(MODULE_SESSION_COLS)
	)
}

/** Ver `renameAnalyticsChatSession`: `updated_at` fica com o trigger `trg_touch_mcs`. */
export async function renameModuleChatSession(db: SisubDb, ctx: UserContext, input: RenameChatSession): Promise<void> {
	const rows = await runQuery("UPDATE_FAILED", () =>
		db
			.update(moduleChatSessionInKitchen)
			.set({ title: input.title })
			.where(ownsModuleSession(ctx.userId, input.sessionId))
			.returning({ id: moduleChatSessionInKitchen.id })
	)
	if (rows.length === 0) throw new NotFoundError("module_chat_session", input.sessionId)
}

/** Exclusão definitiva; as mensagens caem por `ON DELETE CASCADE`. */
export async function deleteModuleChatSession(db: SisubDb, ctx: UserContext, input: ChatSessionRef): Promise<void> {
	const rows = await runQuery("DELETE_FAILED", () =>
		db.delete(moduleChatSessionInKitchen).where(ownsModuleSession(ctx.userId, input.sessionId)).returning({ id: moduleChatSessionInKitchen.id })
	)
	if (rows.length === 0) throw new NotFoundError("module_chat_session", input.sessionId)
}

// ── Chat agêntico por módulo: mensagens ──────────────────────────────────────

/** Ver `listAnalyticsChatMessages` — mesma razão para o `leftJoin` a partir da sessão. */
export async function listModuleChatMessages(db: SisubDb, ctx: UserContext, input: ChatSessionRef): Promise<ModuleChatMessageRow[]> {
	const rows = await runQuery("QUERY_FAILED", () =>
		db
			.select(MODULE_MESSAGE_COLS)
			.from(moduleChatSessionInKitchen)
			.leftJoin(moduleChatMessageInKitchen, eq(moduleChatMessageInKitchen.sessionId, moduleChatSessionInKitchen.id))
			.where(ownsModuleSession(ctx.userId, input.sessionId))
			.orderBy(asc(moduleChatMessageInKitchen.createdAt))
	)

	if (rows.length === 0) throw new NotFoundError("module_chat_session", input.sessionId)

	return rows
		.filter((r): r is ModuleChatMessageRow => r.id !== null)
		.map((r) => ({
			id: r.id,
			session_id: r.session_id,
			role: r.role,
			content: r.content,
			tool_calls: r.tool_calls as Json | null,
			tool_call_id: r.tool_call_id,
			tool_name: r.tool_name,
			tool_result: r.tool_result as Json | null,
			error: r.error,
			created_at: r.created_at,
		}))
}

async function assertOwnsModuleSession(tx: SisubTx, userId: string, sessionId: string): Promise<void> {
	const rows = await tx.select({ id: moduleChatSessionInKitchen.id }).from(moduleChatSessionInKitchen).where(ownsModuleSession(userId, sessionId)).limit(1)
	if (rows.length === 0) throw new NotFoundError("module_chat_session", sessionId)
}

/** Ver `saveAnalyticsChatMessage` — posse e INSERT na mesma transação. */
export async function saveModuleChatMessage(db: SisubDb, ctx: UserContext, input: SaveModuleChatMessage): Promise<ModuleChatMessageRow> {
	return runQuery("INSERT_FAILED", () =>
		db.transaction(async (tx) => {
			await assertOwnsModuleSession(tx, ctx.userId, input.sessionId)

			const [row] = await tx
				.insert(moduleChatMessageInKitchen)
				.values({
					sessionId: input.sessionId,
					role: input.role,
					content: input.content,
					toolCalls: input.toolCalls ?? null,
					toolCallId: input.toolCallId ?? null,
					toolName: input.toolName ?? null,
					toolResult: input.toolResult ?? null,
					error: input.error ?? null,
					model: input.model ?? null,
					latencyMs: input.latencyMs ?? null,
					langsmithRunId: input.langsmithRunId ?? null,
					inputTokens: input.inputTokens ?? null,
					outputTokens: input.outputTokens ?? null,
				})
				.returning(MODULE_MESSAGE_COLS)

			if (!row) throw new NotFoundError("module_chat_message", input.sessionId)
			// Ver `saveAnalyticsChatMessage`: jsonb chega como `unknown` do drizzle.
			return { ...row, tool_calls: row.tool_calls as Json | null, tool_result: row.tool_result as Json | null }
		})
	)
}
