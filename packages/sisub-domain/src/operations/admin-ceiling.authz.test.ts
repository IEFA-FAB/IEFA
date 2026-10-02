/**
 * Teto da administração de acessos (20261001120000): `admin:3` só passa por quem tem `admin:3`.
 *
 * O console exige `admin:2`. Antes do teto, um `admin:2` virava `admin:3` por três caminhos —
 * statement `admin:3` numa política + anexo a si mesmo, grant inline novo, ou subir o próprio
 * grant de 2 para 3 — e revogava quem estava acima dele. Aqui fica a recusa ANTECIPADA do
 * domínio (o que se vê no input e na linha lida); a regra inteira, inclusive "mexer no acesso
 * de quem detém `admin:3`" e "anexar política que concede `admin:3`", é da função SQL, provada
 * em `packages/database/scripts/access-audit/admin-ceiling.test.sql` e no teste de integração
 * do sisub. O token dela (`ADMIN_LEVEL_3_REQUIRED`) vira a mesma frase — caso no fim do arquivo.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserPermission } from "@iefa/pbac"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import type { UserContext } from "../types/context.ts"
import type { DomainError } from "../types/errors.ts"
import { TOP_ADMIN_REQUIRED_MESSAGE } from "./access-change.ts"
import { createUserPermission, deleteUserPermission, updateUserPermission } from "./permissions.ts"
import { addPolicyStatement, attachPolicy, removePolicyStatement, updatePolicyStatement } from "./policies.ts"

const NO_SCOPE = { kitchen_id: null, mess_hall_id: null, unit_id: null }

function ctxWith(permissions: Array<Pick<UserPermission, "module" | "level">>): UserContext {
	return {
		userId: "actor",
		permissions: permissions.map((p) => ({ ...p, ...NO_SCOPE })) as UserPermission[],
		aal: 1,
		lastFactorAt: null,
		origin: "session",
	}
}

const ADMIN_2 = ctxWith([{ module: "admin", level: 2 }])
const ADMIN_3 = ctxWith([{ module: "admin", level: 3 }])
/** `admin:3` bloqueado: deny vence, então não é teto. */
const ADMIN_3_DENIED = ctxWith([
	{ module: "admin", level: 3 },
	{ module: "admin", level: 0 },
])

const EDITABLE_POLICY = { id: "pol-1", name: "Turma", description: null, managed: false, created_at: "", deleted_at: null }

/**
 * Stub do Drizzle: `selects` responde às leituras por `select` (na ordem); a foto do acesso do
 * ator volta vazia (a mudança não toca o ator); `execute` da função auditada é contado em
 * `executed` e falha com `error` quando informado.
 */
function stubDb(selects: unknown[][] = [], error?: unknown) {
	const queue = [...selects]
	const state = { executed: 0 }
	const dialect = new PgDialect()
	const chain = { from: () => chain, where: () => chain, limit: () => Promise.resolve(queue.shift() ?? []) }
	const db = {
		select: () => chain,
		execute: (query: SQL) => {
			if (dialect.sqlToQuery(query).sql.includes("actor-access-snapshot")) {
				return Promise.resolve([{ snapshot: { inline: [], attachments: [], policies: [] } }])
			}
			state.executed++
			if (error) return Promise.reject(error)
			return Promise.resolve([
				{ result: { log_id: "log-1", permission_id: "p1", user_id: "target", statement_id: "s1", module: "admin", level: 3, change: "attach" } },
			])
		},
	} as unknown as SisubDb
	return { db, state }
}

const caught = (promise: Promise<unknown>) =>
	promise.then(
		() => null,
		(e: unknown) => e as DomainError
	)

describe("grant inline", () => {
	test("admin:2 não concede admin:3 — nem a si mesmo, nem a outro; nada chega ao banco", async () => {
		for (const userId of ["actor", "target"]) {
			const { db, state } = stubDb()
			const error = await caught(createUserPermission(db, ADMIN_2, { userId, module: "admin", level: 3 }))
			expect(error?.code).toBe("GRANT_NOT_ALLOWED")
			expect(error?.message).toBe(TOP_ADMIN_REQUIRED_MESSAGE)
			expect(state.executed).toBe(0)
		}
	})

	test("admin:2 segue concedendo admin:2 e qualquer outro módulo em nível 3", async () => {
		for (const grant of [
			{ module: "admin", level: 2 },
			{ module: "global", level: 3 },
		] as const) {
			const { db, state } = stubDb()
			await expect(createUserPermission(db, ADMIN_2, { userId: "target", ...grant })).resolves.toMatchObject({ success: true })
			expect(state.executed).toBe(1)
		}
	})

	test("admin:3 concede admin:3; admin:3 bloqueado por deny não (nem passa do guard do console)", async () => {
		const top = stubDb()
		await expect(createUserPermission(top.db, ADMIN_3, { userId: "target", module: "admin", level: 3 })).resolves.toMatchObject({ success: true })
		expect(top.state.executed).toBe(1)

		const denied = stubDb()
		expect((await caught(createUserPermission(denied.db, ADMIN_3_DENIED, { userId: "target", module: "admin", level: 3 })))?.code).toBe("PERMISSION_DENIED")
		expect(denied.state.executed).toBe(0)
	})

	test("admin:2 não rebaixa, não altera o prazo nem revoga o admin:3 de outra pessoa", async () => {
		const row = { id: "p-top", userId: "target", module: "admin", level: 3 }
		const lower = stubDb([[row]])
		expect((await caught(updateUserPermission(lower.db, ADMIN_2, { permissionId: "p-top", level: 2 })))?.code).toBe("GRANT_NOT_ALLOWED")
		const expiry = stubDb([[row]])
		expect((await caught(updateUserPermission(expiry.db, ADMIN_2, { permissionId: "p-top", level: 3, expires_at: null })))?.code).toBe("GRANT_NOT_ALLOWED")
		const revoke = stubDb([[row]])
		expect((await caught(deleteUserPermission(revoke.db, ADMIN_2, { permissionId: "p-top" })))?.code).toBe("GRANT_NOT_ALLOWED")
		for (const stub of [lower, expiry, revoke]) expect(stub.state.executed).toBe(0)
	})

	test("admin:2 não sobe o admin:2 de outra pessoa para 3", async () => {
		const { db, state } = stubDb([[{ id: "p-2", userId: "target", module: "admin", level: 2 }]])
		expect((await caught(updateUserPermission(db, ADMIN_2, { permissionId: "p-2", level: 3 })))?.code).toBe("GRANT_NOT_ALLOWED")
		expect(state.executed).toBe(0)
	})
})

describe("statement de política", () => {
	test("admin:2 não cria statement admin:3 (o primeiro passo da escalada por política)", async () => {
		const { db, state } = stubDb([[EDITABLE_POLICY]])
		const error = await caught(addPolicyStatement(db, ADMIN_2, { policyId: "pol-1", statement: { module: "admin", level: 3 } }))
		expect(error?.code).toBe("GRANT_NOT_ALLOWED")
		expect(state.executed).toBe(0)
	})

	test("admin:2 não transforma statement em admin:3, nem altera ou remove um statement admin:3", async () => {
		const promote = stubDb([[{ policyId: "pol-1", module: "kitchen", level: 2 }], [EDITABLE_POLICY]])
		expect((await caught(updatePolicyStatement(promote.db, ADMIN_2, { statementId: "s1", statement: { module: "admin", level: 3 } })))?.code).toBe(
			"GRANT_NOT_ALLOWED"
		)
		const demote = stubDb([[{ policyId: "pol-1", module: "admin", level: 3 }], [EDITABLE_POLICY]])
		expect((await caught(updatePolicyStatement(demote.db, ADMIN_2, { statementId: "s1", statement: { module: "kitchen", level: 1 } })))?.code).toBe(
			"GRANT_NOT_ALLOWED"
		)
		const remove = stubDb([[{ policyId: "pol-1", module: "admin", level: 3 }], [EDITABLE_POLICY]])
		expect((await caught(removePolicyStatement(remove.db, ADMIN_2, { statementId: "s1" })))?.code).toBe("GRANT_NOT_ALLOWED")
		for (const stub of [promote, demote, remove]) expect(stub.state.executed).toBe(0)
	})

	test("admin:3 cria o statement admin:3; admin:2 segue editando statements abaixo do teto", async () => {
		const top = stubDb([[EDITABLE_POLICY]])
		await expect(addPolicyStatement(top.db, ADMIN_3, { policyId: "pol-1", statement: { module: "admin", level: 3 } })).resolves.toBeDefined()
		expect(top.state.executed).toBe(1)

		const below = stubDb([[EDITABLE_POLICY]])
		await expect(addPolicyStatement(below.db, ADMIN_2, { policyId: "pol-1", statement: { module: "admin", level: 2 } })).resolves.toBeDefined()
		expect(below.state.executed).toBe(1)
	})
})

describe("o que só a função SQL vê", () => {
	test("ADMIN_LEVEL_3_REQUIRED da função (anexar política que concede admin:3) vira a mesma frase, sem SQL cru", async () => {
		const sqlError = Object.assign(new Error("Failed query: select access_control.attach_policy(...)"), {
			cause: { code: "42501", message: "ADMIN_LEVEL_3_REQUIRED" },
		})
		const { db, state } = stubDb([], sqlError)
		const error = await caught(attachPolicy(db, ADMIN_2, { userId: "target", policyId: "pol-top" }))
		expect(state.executed).toBe(1)
		expect(error?.code).toBe("GRANT_NOT_ALLOWED")
		expect(error?.message).toBe(TOP_ADMIN_REQUIRED_MESSAGE)
		expect(error?.message).not.toContain("Failed query")
	})
})
