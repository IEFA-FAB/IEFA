/**
 * Contrato de autorização das chaves de API do MCP (`access_control.mcp_api_keys`).
 *
 * Aqui não há módulo PBAC a exigir: a chave é do usuário. A barreira é o ESCOPO — o dono tem
 * que sair de `ctx.userId` e entrar no `where` de TODA leitura e mutação. Um `where id = ?`
 * cru revogaria ou apagaria a credencial de qualquer outro usuário a partir do id, que é
 * público na URL da própria lista.
 *
 * O teste inspeciona o predicado real: compila o `SQL` capturado com o dialeto do Postgres e
 * confere que o id da sessão está entre os parâmetros. Assim ele falha se alguém remover o
 * `eq(userId, ctx.userId)` — e não só se a operação inteira sumir.
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

const ctx: UserContext = { userId: SESSION_USER, permissions: [] }

type Captured = { where?: SQL; values?: Record<string, unknown> }

/**
 * Stub do handle Drizzle que captura o predicado e o payload. `rows` decide o desfecho:
 * `[]` simula o WHERE que não casou nada (chave de outro usuário, ou inexistente).
 */
function fakeDb(captured: Captured, rows: unknown[]): SisubDb {
	const chain = {
		from: () => chain,
		set: () => chain,
		where: (w: SQL) => {
			captured.where = w
			return chain
		},
		values: (v: Record<string, unknown>) => {
			captured.values = v
			return chain
		},
		orderBy: () => Promise.resolve(rows),
		returning: () => Promise.resolve(rows),
	}
	return { select: () => chain, insert: () => chain, update: () => chain, delete: () => chain } as unknown as SisubDb
}

const ROW = [{ id: KEY_ID }]

/** Parâmetros do predicado, como o Postgres os receberia. */
function whereParams(captured: Captured): unknown[] {
	expect(captured.where, "a operação não montou nenhum predicado").toBeDefined()
	return new PgDialect().sqlToQuery(captured.where as SQL).params
}

const SCOPED: [string, (db: SisubDb) => Promise<unknown>][] = [
	["listMcpApiKeys", (db) => listMcpApiKeys(db, ctx)],
	["revokeMcpApiKey", (db) => revokeMcpApiKey(db, ctx, { id: KEY_ID })],
	["deleteMcpApiKey", (db) => deleteMcpApiKey(db, ctx, { id: KEY_ID })],
]

const MUTATIONS: [string, (db: SisubDb) => Promise<unknown>][] = [
	["revokeMcpApiKey", (db) => revokeMcpApiKey(db, ctx, { id: KEY_ID })],
	["deleteMcpApiKey", (db) => deleteMcpApiKey(db, ctx, { id: KEY_ID })],
]

describe("escopo das chaves de API do MCP", () => {
	test.each(SCOPED)("%s filtra pelo usuário da sessão", async (_name, run) => {
		const captured: Captured = {}
		await run(fakeDb(captured, ROW))
		expect(whereParams(captured)).toContain(SESSION_USER)
	})

	test.each(MUTATIONS)("%s não alcança a chave de outro usuário", async (_name, run) => {
		const captured: Captured = {}
		// WHERE com o id da sessão não casa a linha alheia → 0 linhas afetadas.
		await expect(run(fakeDb(captured, []))).rejects.toBeInstanceOf(DomainError)
		expect(whereParams(captured)).not.toContain(OTHER_USER)
	})

	test("createMcpApiKey grava o dono da sessão, não um id vindo do input", async () => {
		const captured: Captured = {}
		// O schema não tem campo de dono; o excedente aqui prova que nada dele chega ao insert.
		await createMcpApiKey(fakeDb(captured, ROW), ctx, { label: "cli", userId: OTHER_USER } as never)
		expect(captured.values?.userId).toBe(SESSION_USER)
	})

	test("createMcpApiKey devolve a chave em claro uma vez e persiste só o hash", async () => {
		const captured: Captured = {}
		const { key } = await createMcpApiKey(fakeDb(captured, ROW), ctx, { label: "cli" })

		expect(key).toMatch(/^smcp_[0-9a-f]{64}$/)
		expect(captured.values?.keyHash).toMatch(/^[0-9a-f]{64}$/)
		expect(captured.values?.keyHash).not.toBe(key)
		expect(captured.values?.keyPrefix).toBe(key.slice(0, 12))
	})
})
