/**
 * Formulário de SARAM digitado (`syncUserSaram`): desde 20261003100000 ele não grava o número —
 * sincroniza o e-mail da sessão e entrega o SARAM a `core.claim_saram`, que só vincula o candidato
 * único da chave do e-mail e abre pedido para o resto. A regra (e o lock por SARAM) mora no banco
 * e é provada no harness SQL (`packages/database/scripts/access-audit/saram-link.test.sql`); aqui
 * fica o que é do domínio: o que vai para a função, de quem, e a tradução dos erros.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { DomainError } from "../types/errors.ts"
import { syncUserSaram } from "./user.ts"

const USER = "11111111-1111-1111-1111-111111111111"
const dialect = new PgDialect()

function fakeDb(outcome: { result?: Record<string, unknown>; error?: unknown } = {}) {
	const upserts: Array<Record<string, unknown>> = []
	const executed: Array<{ sql: string; params: unknown[] }> = []
	const db = {
		insert: () => ({
			values: (values: Record<string, unknown>) => ({
				onConflictDoUpdate: () => {
					upserts.push(values)
					return Promise.resolve()
				},
			}),
		}),
		execute: (query: SQL) => {
			executed.push(dialect.sqlToQuery(query))
			if (outcome.error) return Promise.reject(outcome.error)
			return Promise.resolve([{ result: outcome.result ?? { outcome: "linked", status: { status: "verified" } } }])
		},
	}
	return { db: db as unknown as SisubDb, upserts, executed }
}

const pgError = (message: string, code = "P0001") => Object.assign(new Error("Failed query: select core.claim_saram(...)"), { cause: { code, message } })

describe("syncUserSaram", () => {
	test("sincroniza o e-mail SEM o saram e entrega o número a core.claim_saram, com a sessão", async () => {
		const { db, upserts, executed } = fakeDb()
		const result = await syncUserSaram(db, { userId: USER, email: "andrealc@fab.mil.br", saram: " 1000001 ", emailConfirmed: true })

		expect(upserts).toEqual([{ id: USER, email: "andrealc@fab.mil.br" }])
		expect(executed).toHaveLength(1)
		expect(executed[0]?.sql).toContain("core.claim_saram(")
		expect(executed[0]?.params).toEqual([USER, "andrealc@fab.mil.br", true, "1000001"])
		expect(result?.outcome).toBe("linked")
		expect(result?.status.status).toBe("verified")
	})

	test("vazio não limpa nada: só o e-mail é sincronizado", async () => {
		const { db, upserts, executed } = fakeDb()
		expect(await syncUserSaram(db, { userId: USER, email: "x@fab.mil.br", saram: "  ", emailConfirmed: true })).toBeNull()
		expect(upserts).toHaveLength(1)
		expect(executed).toHaveLength(0)
	})

	test("o número que não é do e-mail vira pedido, e a conta não vê dado nenhum", async () => {
		const { db } = fakeDb({ result: { outcome: "requested", request_id: "r-1", status: { status: "pending_request", visible: false } } })
		const result = await syncUserSaram(db, { userId: USER, email: "x@fab.mil.br", saram: "7654321", emailConfirmed: true })
		expect(result?.outcome).toBe("requested")
		expect(result?.requestId).toBe("r-1")
		expect(result?.status.visible).toBe(false)
	})

	test("e-mail vazio da sessão vai como null (não como chave)", async () => {
		const { db, executed } = fakeDb()
		await syncUserSaram(db, { userId: USER, email: "", saram: "1000001", emailConfirmed: false })
		expect(executed[0]?.params).toEqual([USER, null, false, "1000001"])
	})

	test.each([
		["SARAM_LOCKED", "SARAM_LOCKED"],
		["ACCOUNT_INSTITUTIONAL", "ACCOUNT_INSTITUTIONAL"],
		["REQUEST_PENDING", "REQUEST_PENDING"],
		["SARAM_INVALID", "INVALID_INPUT"],
	])("%s da função vira DomainError legível (%s)", async (token, code) => {
		const { db } = fakeDb({ error: pgError(token, token === "SARAM_INVALID" ? "22023" : "P0001") })
		const error = await syncUserSaram(db, { userId: USER, email: "x@fab.mil.br", saram: "1234567", emailConfirmed: true }).catch((e) => e)
		expect(error).toBeInstanceOf(DomainError)
		expect((error as DomainError).code).toBe(code)
		// O SQL cru não vai para a mensagem.
		expect((error as DomainError).message).not.toContain("Failed query")
	})
})
