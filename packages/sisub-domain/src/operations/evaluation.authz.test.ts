/**
 * Contrato de autorização da AVALIAÇÃO INTERNA.
 *
 * Duas autorizações distintas convivem no mesmo arquivo de operations, e trocá-las é o erro
 * fácil — daí este teste:
 *   - a CONFIG (pergunta global, chave `evaluation`) é administração de plataforma → `admin:2`;
 *   - a RESPOSTA é dado pessoal → o autor sai do `UserContext` e o filtro de leitura é o
 *     `userId` da sessão.
 *
 * Antes da migração o gate da config vivia só no `beforeLoad` da rota: qualquer sessão
 * autenticada que chamasse `/_serverFn/...` direto reescrevia a pergunta que a FAB inteira vê.
 *
 * Como no `chat-sessions.authz.test.ts`, o teste é sobre o PREDICADO e não sobre o banco: os
 * operadores `eq`/`and` são os REAIS do drizzle e o stub abre o nó SQL deles para ver os
 * valores ligados. Provar que "a função foi chamada" não provaria nada — o filtro só existe
 * se ENTRAR na query.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext, UserPermission } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import { fetchEvaluationForUser, submitEvaluation, upsertEvalConfig } from "./evaluation.ts"

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const QUESTION = "O sisub te ajudou hoje?"

function perm(module: UserPermission["module"], level: number): UserPermission {
	return { module, level, kitchen_id: null, mess_hall_id: null, unit_id: null }
}

function ctx(userId: string, permissions: UserPermission[] = []): UserContext {
	return { userId, permissions }
}

/**
 * Stub do handle Drizzle com FILA de resultados.
 *
 * `fetchEvaluationForUser` faz duas queries em sequência (config, depois `opinions`), e elas
 * precisam devolver coisas diferentes — um stub de resultado único faria a segunda enxergar a
 * linha da primeira e o teste passaria pelo motivo errado. Cada `await` consome o próximo
 * conjunto; esgotada a fila, devolve vazio.
 *
 * `calls` registra o VERBO de cada query. É o que prova a metade negativa: recusa de
 * permissão tem de acontecer ANTES de qualquer `insert`.
 */
function fakeDb(resultSets: unknown[][] = []) {
	const params: unknown[] = []
	const calls: string[] = []
	let cursor = 0

	function nextRows(): unknown[] {
		const rows = resultSets[cursor] ?? []
		cursor += 1
		return rows
	}

	function chain(kind: string) {
		return (...initial: unknown[]): Record<string, unknown> => {
			calls.push(kind)
			for (const arg of initial) collectParams(arg, params)

			const proxy: Record<string, unknown> = new Proxy(
				{},
				{
					get(_t, prop) {
						if (typeof prop === "symbol") return undefined
						// A fila só avança na EXECUÇÃO (invocação do `then`), não no acesso à
						// propriedade — a maquinaria de promessa lê `.then` antes de chamar.
						if (prop === "then") {
							return (resolve: (v: unknown[]) => unknown) => Promise.resolve(nextRows()).then(resolve)
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
	}

	const db = { select: chain("select"), insert: chain("insert"), update: chain("update"), delete: chain("delete") }
	return { db: db as unknown as SisubDb, params, calls }
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
	// Objeto de `.values()` / `.set()`: os campos entram direto — é por aqui que o `userId`
	// gravado na resposta aparece.
	for (const v of Object.values(node as Record<string, unknown>)) {
		if (typeof v === "string" || typeof v === "number") out.push(v)
	}
}

// ── Config da avaliação: escrita é admin:2 ───────────────────────────────────

describe("upsertEvalConfig — pergunta global é administração de plataforma", () => {
	const DENIED: [string, UserPermission[]][] = [
		["sessão sem permissão nenhuma", []],
		["admin:1 (leitura estrita)", [perm("admin", 1)]],
		["kitchen:2 — escopo local não alcança a config global", [perm("kitchen", 2)]],
		["global:3 — outro módulo, por mais alto que seja o nível", [perm("global", 3)]],
	]

	test.each(DENIED)("nega %s", async (_name, permissions) => {
		const { db, calls } = fakeDb()
		await expect(upsertEvalConfig(db, ctx(USER_A, permissions), { active: true, value: QUESTION })).rejects.toBeInstanceOf(PermissionDeniedError)
		// Metade negativa: a recusa acontece ANTES de tocar o banco.
		expect(calls).toEqual([])
	})

	test("aceita admin:2 e escreve a config", async () => {
		const { db, calls } = fakeDb([[{ active: true, value: QUESTION }]])
		const saved = await upsertEvalConfig(db, ctx(USER_A, [perm("admin", 2)]), { active: true, value: QUESTION })
		expect(saved).toEqual({ active: true, value: QUESTION })
		expect(calls).toEqual(["insert"])
	})

	test("aceita admin:3 — o guard é nível MÍNIMO, não igualdade", async () => {
		const { db, calls } = fakeDb([[{ active: false, value: "" }]])
		await upsertEvalConfig(db, ctx(USER_A, [perm("admin", 3)]), { active: false, value: "" })
		expect(calls).toEqual(["insert"])
	})

	test("um deny de admin derruba a escrita mesmo com allow de mesmo módulo", async () => {
		const { db, calls } = fakeDb()
		const permissions = [perm("admin", 0), perm("admin", 2)]
		await expect(upsertEvalConfig(db, ctx(USER_A, permissions), { active: true, value: QUESTION })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(calls).toEqual([])
	})
})

// ── Resposta: o autor vem da sessão ──────────────────────────────────────────

describe("submitEvaluation — autor sai do contexto, nunca do payload", () => {
	test("grava o userId da sessão", async () => {
		const { db, params, calls } = fakeDb([[{ id: 1 }]])
		await submitEvaluation(db, ctx(USER_A), { value: 5, question: QUESTION })
		expect(calls).toEqual(["insert"])
		expect(params).toContain(USER_A)
	})

	/**
	 * `SubmitEvaluationSchema` não tem campo de autor — este teste trava o buraco pela porta
	 * de baixo: mesmo que alguém acrescente `userId` ao payload (ou o cliente mande o campo a
	 * mais), a operation continua ligando o dono da SESSÃO. O `as` existe justamente porque o
	 * tipo hoje proíbe o campo; se um dia deixar de proibir, o teste segue valendo.
	 */
	test("ignora autor forjado no input", async () => {
		const { db, params } = fakeDb([[{ id: 1 }]])
		const forged = { value: 5, question: QUESTION, userId: USER_B } as unknown as { value: number; question: string }
		await submitEvaluation(db, ctx(USER_A), forged)
		expect(params).toContain(USER_A)
		expect(params).not.toContain(USER_B)
	})
})

// ── Leitura: A não enxerga a avaliação de B ──────────────────────────────────

describe("fetchEvaluationForUser — filtra pelo usuário da sessão", () => {
	const CONFIG_ATIVA = [{ active: true, value: QUESTION }]

	test("liga o userId do contexto na consulta a opinions", async () => {
		const { db, params } = fakeDb([CONFIG_ATIVA, []])
		await fetchEvaluationForUser(db, ctx(USER_A))
		expect(params).toContain(USER_A)
		expect(params).not.toContain(USER_B)
	})

	test("sem resposta do próprio usuário, ainda pergunta", async () => {
		const { db } = fakeDb([CONFIG_ATIVA, []])
		expect(await fetchEvaluationForUser(db, ctx(USER_A))).toEqual({ shouldAsk: true, question: QUESTION })
	})

	/**
	 * O caso que o filtro por usuário existe para impedir, visto do outro lado: a resposta que
	 * o banco devolve é a do PRÓPRIO usuário. Se o `userId` sumisse do WHERE, a resposta de
	 * qualquer pessoa calaria o convite para todo mundo.
	 */
	test("com resposta registrada, para de perguntar", async () => {
		const { db } = fakeDb([CONFIG_ATIVA, [{ id: 1 }]])
		expect(await fetchEvaluationForUser(db, ctx(USER_A))).toEqual({ shouldAsk: false, question: QUESTION })
	})

	test("config desligada encerra antes de tocar opinions", async () => {
		const { db, calls } = fakeDb([[{ active: false, value: QUESTION }]])
		expect(await fetchEvaluationForUser(db, ctx(USER_A))).toEqual({ shouldAsk: false, question: QUESTION })
		expect(calls).toEqual(["select"])
	})

	test("pergunta em branco encerra antes de tocar opinions", async () => {
		const { db, calls } = fakeDb([[{ active: true, value: "" }]])
		expect(await fetchEvaluationForUser(db, ctx(USER_A))).toEqual({ shouldAsk: false, question: null })
		expect(calls).toEqual(["select"])
	})

	test("linha de config ausente não lança — avaliação simplesmente desligada", async () => {
		const { db, calls } = fakeDb([[]])
		expect(await fetchEvaluationForUser(db, ctx(USER_A))).toEqual({ shouldAsk: false, question: null })
		expect(calls).toEqual(["select"])
	})
})
