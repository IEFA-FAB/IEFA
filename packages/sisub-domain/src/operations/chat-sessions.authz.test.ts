/**
 * Contrato de autorização do HISTÓRICO DE CHAT (analytics + agêntico por módulo).
 *
 * Aqui não há nível PBAC que autorize nada: sessão de chat é dado pessoal, e a única barreira
 * é o `user_id` da sessão autenticada entrar no WHERE de TODA query. Com Drizzle a conexão usa
 * o role do projeto e RLS não se aplica — um `where id = ?` sem o dono devolveria a conversa
 * de qualquer usuário para quem souber (ou adivinhar) o UUID.
 *
 * O teste é sobre o PREDICADO, não sobre o banco: o stub registra o SQL de cada query e o
 * conjunto de valores ligados a ela. Duas coisas são provadas por operação:
 *   1. o `userId` do contexto aparece entre os parâmetros — o filtro de posse existe;
 *   2. um `userId` DIFERENTE do dono não aparece — nada no input consegue trocar o dono
 *      (não há campo `userId` em schema nenhum de `chat.ts`, e é isso que o teste trava).
 *
 * O caso concreto que isto existe para impedir: o usuário A passando o `sessionId` do usuário
 * B e recebendo/apagando a conversa dele.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { NotFoundError } from "../types/errors.ts"
import {
	createAnalyticsChatSession,
	createModuleChatSession,
	deleteAnalyticsChatSession,
	deleteModuleChatSession,
	listAnalyticsChatMessages,
	listAnalyticsChatSessions,
	listModuleChatMessages,
	listModuleChatSessions,
	renameAnalyticsChatSession,
	renameModuleChatSession,
	saveAnalyticsChatMessage,
	saveModuleChatMessage,
	updateAnalyticsMessageChartType,
} from "./chat-sessions.ts"

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
/** Sessão do usuário B — é o id que A tenta usar em todos os casos abaixo. */
const SESSION_OF_B = "11111111-1111-4111-8111-111111111111"
const MESSAGE_OF_B = "22222222-2222-4222-8222-222222222222"

function ctx(userId: string): UserContext {
	return { userId, permissions: [] }
}

/**
 * Stub do handle Drizzle que executa o SQL de verdade até a serialização.
 *
 * Não basta espionar a chamada: o filtro de posse só existe se ENTRAR na query. Por isso o
 * stub deixa o drizzle montar a query e só intercepta na execução (`then`/`execute`),
 * inspecionando os parâmetros ligados. `rows` é o que a query devolve — vazio simula
 * "sessão não é do usuário" (o WHERE com o dono não casou nada).
 */
function fakeDb(rows: unknown[] = []) {
	const params: unknown[] = []

	// Encadeamento tolerante: qualquer método do builder devolve o próprio builder, e
	// `then` fecha a promessa. Assim uma query nova não quebra o stub — só o que importa
	// (os valores ligados a `where`/`values`/`set`) é observado. Os operadores `eq`/`and`
	// são os REAIS do drizzle: é o nó SQL deles que o stub abre.
	function chain(): Record<string, unknown> {
		const proxy: Record<string, unknown> = new Proxy(
			{},
			{
				get(_t, prop) {
					if (typeof prop === "symbol") return undefined
					if (prop === "then") {
						return (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows).then(resolve)
					}
					return (...args: unknown[]) => {
						for (const arg of args) collectParams(arg, params)
						return proxy
					}
				},
			}
		)
		return proxy
	}

	const db = {
		select: chain,
		insert: chain,
		update: chain,
		delete: chain,
		transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(db),
	}
	return { db: db as unknown as SisubDb, params }
}

/**
 * Extrai os valores ligados de um nó SQL do drizzle (`eq(col, value)` vira um `SQL` com
 * `queryChunks`, e os valores ficam em `Param.value`). Recursivo: `and(...)` aninha.
 */
function collectParams(node: unknown, out: unknown[]): void {
	if (node == null || typeof node !== "object") return
	if (Array.isArray(node)) {
		for (const item of node) collectParams(item, out)
		return
	}
	const chunks = (node as { queryChunks?: unknown[] }).queryChunks
	if (Array.isArray(chunks)) {
		for (const chunk of chunks) collectParams(chunk, out)
		return
	}
	// `Param` do drizzle — o valor ligado de um `eq(col, x)`. Reconhecido pelo PAR
	// `value` + `encoder`, nunca só por `value`: a coluna `opinions.value` existe, e
	// tratar todo objeto com `value` como Param fazia o `.values({ value, question,
	// userId })` ser lido como o número 5 e engolir o autor — o teste então passava
	// dizendo que o `userId` não estava lá.
	const param = node as { value?: unknown; encoder?: unknown }
	if ("encoder" in param) {
		if (typeof param.value === "string" || typeof param.value === "number") out.push(param.value)
		return
	}
	// Objeto de `.values()` / `.set()`: os campos entram direto (userId de criação).
	for (const v of Object.values(node as Record<string, unknown>)) {
		if (typeof v === "string" || typeof v === "number") out.push(v)
	}
}

// ── Leitura: A não enxerga a conversa de B ───────────────────────────────────

const READS: [string, (db: SisubDb, c: UserContext) => Promise<unknown>][] = [
	["listAnalyticsChatSessions", (db, c) => listAnalyticsChatSessions(db, c)],
	["listAnalyticsChatMessages", (db, c) => listAnalyticsChatMessages(db, c, { sessionId: SESSION_OF_B })],
	["listModuleChatSessions", (db, c) => listModuleChatSessions(db, c, { module: "kitchen", scopeId: 2 })],
	["listModuleChatMessages", (db, c) => listModuleChatMessages(db, c, { sessionId: SESSION_OF_B })],
]

describe("leitura de histórico é filtrada pelo dono da sessão", () => {
	test.each(READS)("%s liga o userId do contexto na query", async (_name, run) => {
		const { db, params } = fakeDb([])
		await run(db, ctx(USER_A)).catch(() => undefined)
		expect(params).toContain(USER_A)
		expect(params).not.toContain(USER_B)
	})
})

describe("A pedindo a conversa de B", () => {
	// `rows` vazio é exatamente o que o banco devolve quando o WHERE inclui o dono e ele
	// não casa: a operação tem que virar 404, nunca lista vazia (estado vazio que mentiria
	// dizendo "essa conversa não tem mensagens").
	test("listAnalyticsChatMessages nega em vez de devolver lista vazia", async () => {
		const { db } = fakeDb([])
		await expect(listAnalyticsChatMessages(db, ctx(USER_A), { sessionId: SESSION_OF_B })).rejects.toBeInstanceOf(NotFoundError)
	})

	test("listModuleChatMessages nega em vez de devolver lista vazia", async () => {
		const { db } = fakeDb([])
		await expect(listModuleChatMessages(db, ctx(USER_A), { sessionId: SESSION_OF_B })).rejects.toBeInstanceOf(NotFoundError)
	})
})

// ── Escrita: A não renomeia, apaga nem escreve na conversa de B ──────────────

const WRITES_ON_SESSION: [string, (db: SisubDb, c: UserContext) => Promise<unknown>][] = [
	["renameAnalyticsChatSession", (db, c) => renameAnalyticsChatSession(db, c, { sessionId: SESSION_OF_B, title: "roubada" })],
	["deleteAnalyticsChatSession", (db, c) => deleteAnalyticsChatSession(db, c, { sessionId: SESSION_OF_B })],
	["renameModuleChatSession", (db, c) => renameModuleChatSession(db, c, { sessionId: SESSION_OF_B, title: "roubada" })],
	["deleteModuleChatSession", (db, c) => deleteModuleChatSession(db, c, { sessionId: SESSION_OF_B })],
	["saveAnalyticsChatMessage", (db, c) => saveAnalyticsChatMessage(db, c, { sessionId: SESSION_OF_B, role: "user", content: "oi" })],
	["saveModuleChatMessage", (db, c) => saveModuleChatMessage(db, c, { sessionId: SESSION_OF_B, role: "user", content: "oi" })],
	["updateAnalyticsMessageChartType", (db, c) => updateAnalyticsMessageChartType(db, c, { messageId: MESSAGE_OF_B, chartTypeOverride: "pie" })],
]

describe("escrita em sessão alheia", () => {
	test.each(WRITES_ON_SESSION)("%s falha quando o WHERE com o dono não casa", async (_name, run) => {
		const { db } = fakeDb([])
		await expect(run(db, ctx(USER_A))).rejects.toBeInstanceOf(NotFoundError)
	})

	test.each(WRITES_ON_SESSION)("%s liga o userId do contexto, nunca o do dono real", async (_name, run) => {
		const { db, params } = fakeDb([])
		await run(db, ctx(USER_A)).catch(() => undefined)
		expect(params).toContain(USER_A)
		expect(params).not.toContain(USER_B)
	})
})

// ── Criação: o dono vem do contexto, não do input ────────────────────────────

describe("criação de sessão grava o dono da sessão autenticada", () => {
	test("createAnalyticsChatSession usa ctx.userId", async () => {
		const { db, params } = fakeDb([{ id: SESSION_OF_B }])
		await createAnalyticsChatSession(db, ctx(USER_A), { title: "Novo chat" }).catch(() => undefined)
		expect(params).toContain(USER_A)
		expect(params).not.toContain(USER_B)
	})

	test("createModuleChatSession usa ctx.userId", async () => {
		const { db, params } = fakeDb([{ id: SESSION_OF_B }])
		await createModuleChatSession(db, ctx(USER_A), { title: "Novo chat", module: "global" }).catch(() => undefined)
		expect(params).toContain(USER_A)
		expect(params).not.toContain(USER_B)
	})
})
