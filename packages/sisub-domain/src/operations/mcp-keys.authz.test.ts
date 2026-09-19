/**
 * Contrato de autorização das chaves de API do MCP (`access_control.mcp_api_keys`).
 *
 * Aqui não há módulo PBAC a exigir: a chave é do usuário. A barreira é o ESCOPO — o dono tem
 * que sair de `ctx.userId` e entrar no `where` de TODA leitura e mutação. Um `where id = ?`
 * cru revogaria ou apagaria a credencial de qualquer outro usuário a partir do id, que é
 * público na URL da própria lista.
 *
 * O teste inspeciona a query real: compila o `SQL` capturado com o dialeto do Postgres e
 * confere que o id da sessão está entre os parâmetros. Na leitura é o `where`; nas mutações
 * (desde 20260921120000) é o ATOR da função SQL auditada, que é também o dono — a função só
 * alcança a linha com `user_id = p_actor`, e é o teste SQL local
 * (`packages/database/scripts/access-audit`) que prova esse lado.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { createMcpApiKey, deleteMcpApiKey, listMcpApiKeys, revokeMcpApiKey } from "./mcp-keys.ts"

const SESSION_USER = "11111111-1111-1111-1111-111111111111"
const OTHER_USER = "22222222-2222-2222-2222-222222222222"
const KEY_ID = "33333333-3333-3333-3333-333333333333"

const ctx: UserContext = { userId: SESSION_USER, permissions: [], aal: 1, lastFactorAt: null, origin: "session" }

type Captured = { where?: SQL; executed: Array<{ sql: string; params: unknown[] }> }

/**
 * Stub do handle Drizzle. A leitura (`select`) captura o predicado; as mutações passam por
 * `execute` (a função SQL auditada) e devolvem `result` — ou falham com o token da função.
 */
function fakeDb(captured: Captured, outcome: { rows?: unknown[]; result?: Record<string, unknown>; error?: unknown } = {}): SisubDb {
	const dialect = new PgDialect()
	const chain = {
		from: () => chain,
		where: (w: SQL) => {
			captured.where = w
			return chain
		},
		orderBy: () => Promise.resolve(outcome.rows ?? []),
	}
	return {
		select: () => chain,
		execute: (query: SQL) => {
			captured.executed.push(dialect.sqlToQuery(query))
			if (outcome.error) return Promise.reject(outcome.error)
			return Promise.resolve([{ result: outcome.result ?? { log_id: "log-1", id: KEY_ID, changed: true } }])
		},
	} as unknown as SisubDb
}

const captured = (): Captured => ({ executed: [] })

/** O erro que a função auditada levanta quando a chave não é do ator (ou não existe). */
const notOwned = Object.assign(new Error("Failed query: select access_control.revoke_mcp_api_key(...)"), {
	cause: { code: "P0002", message: "MCP_KEY_NOT_FOUND" },
})

const MUTATIONS: [string, (db: SisubDb) => Promise<unknown>][] = [
	["revokeMcpApiKey", (db) => revokeMcpApiKey(db, ctx, { id: KEY_ID })],
	["deleteMcpApiKey", (db) => deleteMcpApiKey(db, ctx, { id: KEY_ID })],
]

describe("escopo das chaves de API do MCP", () => {
	test("listMcpApiKeys filtra pelo usuário da sessão", async () => {
		const c = captured()
		await listMcpApiKeys(fakeDb(c), ctx)
		expect(c.where, "a leitura não montou nenhum predicado").toBeDefined()
		expect(new PgDialect().sqlToQuery(c.where as SQL).params).toContain(SESSION_USER)
	})

	test.each(MUTATIONS)("%s chama a função auditada com o ATOR (= dono) da sessão", async (_name, run) => {
		const c = captured()
		await run(fakeDb(c))
		expect(c.executed[0].params[0]).toBe(SESSION_USER)
		expect(c.executed[0].params).toContain(KEY_ID)
	})

	test.each(MUTATIONS)("%s não alcança a chave de outro usuário", async (_name, run) => {
		const c = captured()
		// A função só casa `user_id = p_actor`: a chave alheia é "não encontrada".
		await expect(run(fakeDb(c, { error: notOwned }))).rejects.toBeInstanceOf(DomainError)
		expect(c.executed[0].params).not.toContain(OTHER_USER)
	})

	test("createMcpApiKey grava o dono da sessão, não um id vindo do input", async () => {
		const c = captured()
		// O schema não tem campo de dono; o excedente aqui prova que nada dele chega à função.
		await createMcpApiKey(fakeDb(c), ctx, { label: "cli", expiresInDays: 90, userId: OTHER_USER } as never)
		expect(c.executed[0].params[0]).toBe(SESSION_USER)
		expect(c.executed[0].params).not.toContain(OTHER_USER)
	})

	test("createMcpApiKey devolve a chave em claro uma vez e persiste só o hash", async () => {
		const c = captured()
		const { key, row } = await createMcpApiKey(fakeDb(c, { result: { log_id: "log-1", id: KEY_ID, label: "cli" } }), ctx, { label: "cli", expiresInDays: 90 })
		// ator, operação, rótulo, hash, prefixo, prazo, grau
		const [, , , keyHash, keyPrefix] = c.executed[0].params as string[]

		expect(key).toMatch(/^smcp_[0-9a-f]{64}$/)
		expect(keyHash).toMatch(/^[0-9a-f]{64}$/)
		expect(keyHash).not.toBe(key)
		expect(keyPrefix).toBe(key.slice(0, 12))
		// O log_id é do servidor; a linha pública não o carrega (nem o hash).
		expect(row).not.toHaveProperty("log_id")
		expect(row).not.toHaveProperty("key_hash")
	})
})

/**
 * Prazo: a chave criada aqui é a única credencial do sistema que age sem ninguém na frente do
 * teclado. Nascer sem vencimento é o estado que a migration de prazo fechou — e o que o
 * default de 90 dias da coluna cobre é a janela de deploy, nunca o caminho da aplicação.
 */
describe("prazo das chaves de API do MCP", () => {
	test.each([30, 90, 365] as const)("createMcpApiKey grava expires_at para %s dias", async (days) => {
		const c = captured()
		const before = Date.now()

		await createMcpApiKey(fakeDb(c), ctx, { label: "cli", expiresInDays: days })

		const expiresAt = Date.parse(String(c.executed[0].params[5]))
		expect(Number.isFinite(expiresAt), "expires_at ausente ou ilegível na chamada").toBe(true)
		const dias = (expiresAt - before) / (24 * 60 * 60 * 1000)
		expect(dias).toBeGreaterThan(days - 0.01)
		expect(dias).toBeLessThan(days + 0.01)
	})
})
