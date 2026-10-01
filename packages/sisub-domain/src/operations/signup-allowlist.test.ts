/**
 * Autorização de cadastro externo: guard `admin` nível 2, ator da SESSÃO na chamada da função
 * auditada, e os tokens do banco virando frase legível. O comportamento SQL (log na mesma
 * transação, hook) é provado em `packages/database/scripts/access-audit/signup-allowlist.test.sql`.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { AuthorizeExternalSignupSchema } from "../schemas/signup-allowlist.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, PermissionDeniedError } from "../types/errors.ts"
import { authorizeExternalSignup, listSignupAllowlist, revokeExternalSignup } from "./signup-allowlist.ts"

const ADMIN: UserContext = {
	userId: "00000000-0000-0000-0000-0000000000a1",
	permissions: [{ module: "admin", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }],
	aal: 1,
	lastFactorAt: null,
	origin: "session",
}
const READER: UserContext = { ...ADMIN, permissions: [{ module: "admin", level: 1, kitchen_id: null, mess_hall_id: null, unit_id: null }] }

const dialect = new PgDialect()

/** `execute` devolve `rows` ou falha com `error`; cada chamada fica em `calls` como SQL + parâmetros. */
function stubDb(outcome: { rows?: unknown[]; error?: unknown }) {
	const calls: { sql: string; params: unknown[] }[] = []
	const db = {
		execute: (query: SQL) => {
			const rendered = dialect.sqlToQuery(query)
			calls.push({ sql: rendered.sql, params: rendered.params })
			return outcome.error ? Promise.reject(outcome.error) : Promise.resolve(outcome.rows ?? [])
		},
	} as unknown as SisubDb
	return { db, calls }
}

function fromFunction(token: string, code: string): Error {
	return Object.assign(new Error("Failed query: select access_control.x(...)"), { cause: { code, message: token } })
}

describe("AuthorizeExternalSignupSchema", () => {
	test("normaliza o e-mail e apara o motivo", () => {
		const parsed = AuthorizeExternalSignupSchema.parse({ email: "  Parceiro@GS1BR.org ", reason: "  parceria GS1 Brasil  " })
		expect(parsed).toEqual({ email: "parceiro@gs1br.org", reason: "parceria GS1 Brasil" })
	})

	test.each(["sem-arroba", "a@b", "a b@c.org", "a@b@c.org", ""])("recusa e-mail malformado %p", (email) => {
		expect(AuthorizeExternalSignupSchema.safeParse({ email, reason: "parceria GS1 Brasil" }).success).toBe(false)
	})

	test("motivo curto é recusado", () => {
		expect(AuthorizeExternalSignupSchema.safeParse({ email: "a@b.org", reason: "curto" }).success).toBe(false)
	})
})

describe("authorizeExternalSignup", () => {
	test("exige admin nível 2 antes de tocar o banco", async () => {
		const { db, calls } = stubDb({ rows: [] })
		await expect(authorizeExternalSignup(db, READER, { email: "a@b.org", reason: "parceria GS1 Brasil" })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(calls).toHaveLength(0)
	})

	test("chama a função auditada com o ator da SESSÃO e o nome da operação", async () => {
		const { db, calls } = stubDb({ rows: [{ result: { id: "r1", email: "a@b.org", log_id: "l1" } }] })
		const result = await authorizeExternalSignup(db, ADMIN, { email: "a@b.org", reason: "parceria GS1 Brasil" }, undefined, {
			operation: "authorizeExternalSignupFn",
			grade: "fresh",
		})
		expect(result).toEqual({ id: "r1", email: "a@b.org", log_id: "l1" })
		expect(calls).toHaveLength(1)
		expect(calls[0]?.sql).toContain("access_control.authorize_external_signup(")
		expect(calls[0]?.params).toEqual([ADMIN.userId, "authorizeExternalSignupFn", "a@b.org", "parceria GS1 Brasil", "fresh"])
	})

	test.each([
		["SIGNUP_ALLOWLIST_INSTITUTIONAL", "22023", "SIGNUP_INSTITUTIONAL_EMAIL"],
		["SIGNUP_ALLOWLIST_ALREADY_ACTIVE", "23505", "CONFLICT"],
		["ACCESS_ACTOR_NOT_FOUND", "23503", "ACTOR_NOT_FOUND"],
	])("o token %p vira erro de domínio legível", async (token, sqlstate, code) => {
		const { db } = stubDb({ error: fromFunction(token, sqlstate) })
		const error = await authorizeExternalSignup(db, ADMIN, { email: "a@b.org", reason: "parceria GS1 Brasil" }).catch((e: unknown) => e)
		expect(error).toBeInstanceOf(DomainError)
		expect((error as DomainError).code).toBe(code)
		expect((error as DomainError).message).not.toContain("Failed query")
	})
})

describe("revokeExternalSignup", () => {
	test("exige admin nível 2", async () => {
		const { db, calls } = stubDb({ rows: [] })
		await expect(revokeExternalSignup(db, READER, { id: "00000000-0000-0000-0000-0000000000b1" })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(calls).toHaveLength(0)
	})

	test("ator da sessão; revogar o revogado devolve changed=false sem log", async () => {
		const { db, calls } = stubDb({ rows: [{ result: { log_id: null, id: "x", changed: false } }] })
		const result = await revokeExternalSignup(db, ADMIN, { id: "00000000-0000-0000-0000-0000000000b1" })
		expect(result).toEqual({ log_id: null, changed: false })
		expect(calls[0]?.sql).toContain("access_control.revoke_external_signup(")
		expect(calls[0]?.params[0]).toBe(ADMIN.userId)
	})

	test("autorização inexistente vira frase em português", async () => {
		const { db } = stubDb({ error: fromFunction("SIGNUP_ALLOWLIST_NOT_FOUND", "P0002") })
		await expect(revokeExternalSignup(db, ADMIN, { id: "00000000-0000-0000-0000-0000000000b1" })).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: "Autorização não encontrada. Atualize a lista e tente de novo.",
		})
	})
})

describe("listSignupAllowlist", () => {
	test("exige admin nível 2", async () => {
		const { db } = stubDb({ rows: [] })
		await expect(listSignupAllowlist(db, READER)).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("mapeia datas e o indicador de conta existente", async () => {
		const created = new Date("2026-10-01T12:00:00Z")
		const { db } = stubDb({
			rows: [
				{
					id: "r1",
					email: "a@b.org",
					reason: "parceria GS1 Brasil",
					created_at: created,
					authorized_by_email: "admin@fab.mil.br",
					revoked_at: null,
					revoked_by_email: null,
					has_account: true,
				},
			],
		})
		expect(await listSignupAllowlist(db, ADMIN)).toEqual([
			{
				id: "r1",
				email: "a@b.org",
				reason: "parceria GS1 Brasil",
				created_at: "2026-10-01T12:00:00.000Z",
				authorized_by_email: "admin@fab.mil.br",
				revoked_at: null,
				revoked_by_email: null,
				has_account: true,
			},
		])
	})
})
