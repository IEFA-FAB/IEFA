/**
 * Ninguém tira a PRÓPRIA administração — por nível, por prazo, por política ou por DENY.
 *
 * Histórico: a primeira regra só pegava o nível mais baixo; depois vieram o prazo e a política
 * anexada; a revisão seguinte achou o deny (statement `admin:0` numa política anexada ao ator,
 * ou anexar-se a uma política com esse deny — deny vence allow). A regra deixou de enumerar
 * caminhos: toda escrita que pode mexer no conjunto efetivo do próprio ator é SIMULADA
 * (`self-admin-guard.ts`) e recusada se `admin:2` deixaria de valer — agora, ou quando um prazo
 * que ela introduz vencer. As frases específicas (nível, prazo) continuam onde já existiam.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import type { UserContext } from "../types/context.ts"
import type { DomainError } from "../types/errors.ts"
import { selfAdminUpdateRefusal } from "./access-change.ts"
import { createUserPermission, deleteUserPermission, updateUserPermission } from "./permissions.ts"
import { addPolicyStatement, attachPolicy, deletePolicy, detachPolicy, removePolicyStatement, restorePolicy, updatePolicyStatement } from "./policies.ts"
import { type AccessChange, type ActorAccessSnapshot, wouldLoseAdministration } from "./self-admin-guard.ts"

const ADMIN_ID = "admin-1"
const ADMIN: UserContext = {
	userId: ADMIN_ID,
	permissions: [{ module: "admin", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }],
	aal: 1,
	lastFactorAt: null,
	origin: "session",
}

const NO_SCOPE = { unit_id: null, kitchen_id: null, mess_hall_id: null }
const OWN_ADMIN = { userId: ADMIN_ID, module: "admin", level: 2 }

/** Administrador pelo grant inline `p-admin`; política `pol-1` anexada, com um statement de `kitchen`. */
function inlineAdmin(): ActorAccessSnapshot {
	return {
		inline: [{ id: "p-admin", module: "admin", level: 2, ...NO_SCOPE, expired: false }],
		attachments: [{ policy_id: "pol-1", expired: false }],
		policies: [{ id: "pol-1", deleted: false, statements: [{ id: "s-kitchen", module: "kitchen", level: 2, ...NO_SCOPE }] }],
	}
}

/** Administrador SÓ pela política `pol-1` (statement `s-admin`). */
function policyAdmin(): ActorAccessSnapshot {
	return {
		inline: [],
		attachments: [{ policy_id: "pol-1", expired: false }],
		policies: [{ id: "pol-1", deleted: false, statements: [{ id: "s-admin", module: "admin", level: 2, ...NO_SCOPE }] }],
	}
}

describe("wouldLoseAdministration — a simulação", () => {
	test("deny de admin que ENTRA por statement de política anexada tranca, mesmo com o allow inline de pé", () => {
		const change: AccessChange = { kind: "statement-upsert", policyId: "pol-1", statement: { id: "s-kitchen", module: "admin", level: 0, ...NO_SCOPE } }
		expect(wouldLoseAdministration(inlineAdmin(), change)).toBe(true)
	})

	test("anexar-se a uma política com admin:0 tranca", () => {
		const snapshot = inlineAdmin()
		snapshot.policies.push({ id: "pol-deny", deleted: false, statements: [{ id: "s-deny", module: "admin", level: 0, ...NO_SCOPE }] })
		expect(wouldLoseAdministration(snapshot, { kind: "attach", policyId: "pol-deny", ending: false })).toBe(true)
		// …até com prazo: o deny vale AGORA.
		expect(wouldLoseAdministration(snapshot, { kind: "attach", policyId: "pol-deny", ending: true })).toBe(true)
	})

	test("allow com prazo introduzido tranca DEPOIS: conta como perda", () => {
		expect(wouldLoseAdministration(policyAdmin(), { kind: "attach", policyId: "pol-1", ending: true })).toBe(true)
	})

	test("mudanças que mantêm a administração passam", () => {
		// statement de kitchen rebaixado — admin continua pelo inline
		expect(
			wouldLoseAdministration(inlineAdmin(), {
				kind: "statement-upsert",
				policyId: "pol-1",
				statement: { id: "s-kitchen", module: "kitchen", level: 1, ...NO_SCOPE },
			})
		).toBe(false)
		// desanexar pol-1 — a administração não vem dela
		expect(wouldLoseAdministration(inlineAdmin(), { kind: "detach", policyId: "pol-1" })).toBe(false)
		// deny de admin ESCOPADO não derruba o admin sem escopo que o console consulta
		expect(
			wouldLoseAdministration(inlineAdmin(), {
				kind: "inline-upsert",
				row: { id: "(novo)", module: "admin", level: 0, unit_id: 7, kitchen_id: null, mess_hall_id: null },
			})
		).toBe(false)
	})

	test("quem não é administrador não tem o que perder", () => {
		expect(wouldLoseAdministration({ inline: [], attachments: [], policies: [] }, { kind: "detach", policyId: "x" })).toBe(false)
	})
})

describe("selfAdminUpdateRefusal (frases específicas do grant inline)", () => {
	test("baixar o nível ou pôr QUALQUER prazo na própria administração é recusado", () => {
		expect(selfAdminUpdateRefusal(ADMIN_ID, OWN_ADMIN, { level: 1 })).toBe("LEVEL")
		expect(selfAdminUpdateRefusal(ADMIN_ID, OWN_ADMIN, { level: 2, expiresAt: "2000-01-01T00:00:00Z" })).toBe("EXPIRY")
		expect(selfAdminUpdateRefusal(ADMIN_ID, OWN_ADMIN, { level: 3, expiresAt: "2999-01-01T00:00:00Z" })).toBe("EXPIRY")
	})

	test("subir, tornar permanente, ou mexer no grant de outra pessoa pode", () => {
		expect(selfAdminUpdateRefusal(ADMIN_ID, OWN_ADMIN, { level: 3 })).toBeNull()
		expect(selfAdminUpdateRefusal(ADMIN_ID, OWN_ADMIN, { level: 2, expiresAt: null })).toBeNull()
		expect(selfAdminUpdateRefusal(ADMIN_ID, { ...OWN_ADMIN, userId: "other" }, { level: 0 })).toBeNull()
	})
})

/**
 * Stub do Drizzle. `snapshot` responde à foto do acesso do ator; `selects` às leituras por
 * `select` (na ordem); `execute` da função auditada só é alcançado quando a operação passa —
 * `executed` conta.
 */
function stubDb(snapshot: ActorAccessSnapshot, selects: unknown[][] = []) {
	const queue = [...selects]
	const state = { executed: 0 }
	const dialect = new PgDialect()
	const chain = {
		from: () => chain,
		where: () => chain,
		limit: () => Promise.resolve(queue.shift() ?? []),
	}
	const db = {
		select: () => chain,
		execute: (query: SQL) => {
			if (dialect.sqlToQuery(query).sql.includes("actor-access-snapshot")) return Promise.resolve([{ snapshot }])
			state.executed++
			return Promise.resolve([{ result: { log_id: "log-1", change: "attach", statement_id: "s1", permission_id: "p1", user_id: ADMIN_ID, id: "pol-1" } }])
		},
	} as unknown as SisubDb
	return { db, state }
}

const caught = (promise: Promise<unknown>) =>
	promise.then(
		() => null,
		(e: unknown) => e as DomainError
	)

const EDITABLE_POLICY = [{ id: "pol-1", name: "Turma", description: null, managed: false, created_at: "", deleted_at: null }]
const DELETED_POLICY = [{ ...EDITABLE_POLICY[0], deleted_at: "2026-09-01T00:00:00Z" }]

describe("os três caminhos de DENY (revisão de 2026-09-19)", () => {
	test("updatePolicyStatement: transformar um statement de política anexada ao ator em admin:0", async () => {
		// leituras: loadStatement → kitchen; assertPolicyEditable → política
		const { db, state } = stubDb(inlineAdmin(), [[{ policyId: "pol-1", module: "kitchen", level: 2 }], EDITABLE_POLICY])
		const error = await caught(updatePolicyStatement(db, ADMIN, { statementId: "s-kitchen", statement: { module: "admin", level: 0 } }))
		expect(error?.code).toBe("GRANT_NOT_ALLOWED")
		expect(state.executed).toBe(0)
	})

	test("addPolicyStatement: acrescentar admin:0 a uma política anexada ao ator", async () => {
		const { db, state } = stubDb(inlineAdmin(), [EDITABLE_POLICY])
		const error = await caught(addPolicyStatement(db, ADMIN, { policyId: "pol-1", statement: { module: "admin", level: 0 } }))
		expect(error?.code).toBe("GRANT_NOT_ALLOWED")
		expect(state.executed).toBe(0)
	})

	test("attachPolicy: anexar-se a uma política que contém admin:0", async () => {
		const snapshot = inlineAdmin()
		snapshot.policies.push({ id: "pol-deny", deleted: false, statements: [{ id: "s-deny", module: "admin", level: 0, ...NO_SCOPE }] })
		const { db, state } = stubDb(snapshot)
		const error = await caught(attachPolicy(db, ADMIN, { userId: ADMIN_ID, policyId: "pol-deny" }))
		expect(error?.code).toBe("GRANT_NOT_ALLOWED")
		expect(state.executed).toBe(0)
	})

	test("as MESMAS mudanças sobre política que NÃO está anexada ao ator (ou sobre outra pessoa) passam", async () => {
		const notAttached: ActorAccessSnapshot = { ...inlineAdmin(), attachments: [] }
		const add = stubDb(notAttached, [EDITABLE_POLICY])
		await expect(addPolicyStatement(add.db, ADMIN, { policyId: "pol-1", statement: { module: "admin", level: 0 } })).resolves.toBeDefined()
		expect(add.state.executed).toBe(1)

		const snapshot = inlineAdmin()
		snapshot.policies.push({ id: "pol-deny", deleted: false, statements: [{ id: "s-deny", module: "admin", level: 0, ...NO_SCOPE }] })
		const other = stubDb(snapshot)
		await expect(attachPolicy(other.db, ADMIN, { userId: "someone-else", policyId: "pol-deny" })).resolves.toMatchObject({ success: true })
		expect(other.state.executed).toBe(1)
	})
})

describe("os outros caminhos que mexem no próprio acesso", () => {
	test("inline: prazo na própria administração (frase específica) e deny que a derruba", async () => {
		const { db, state } = stubDb(inlineAdmin(), [[{ id: "p-admin", ...OWN_ADMIN }]])
		const error = await caught(updateUserPermission(db, ADMIN, { permissionId: "p-admin", level: 2, expires_at: "2999-01-01T00:00:00Z" }))
		expect(error?.code).toBe("GRANT_NOT_ALLOWED")
		expect(error?.message).toContain("prazo")
		expect(state.executed).toBe(0)

		// criar um deny de admin sem escopo sobre si mesmo — recusado antes da simulação
		const deny = stubDb(inlineAdmin())
		expect((await caught(createUserPermission(deny.db, ADMIN, { userId: ADMIN_ID, module: "admin", level: 0 })))?.code).toBe("GRANT_NOT_ALLOWED")
		expect(deny.state.executed).toBe(0)
	})

	test("inline: apagar o próprio grant de admin é recusado; tornar permanente passa", async () => {
		const del = stubDb(inlineAdmin(), [[{ id: "p-admin", ...OWN_ADMIN }]])
		expect((await caught(deleteUserPermission(del.db, ADMIN, { permissionId: "p-admin" })))?.code).toBe("GRANT_NOT_ALLOWED")

		const permanent = stubDb(inlineAdmin(), [[{ id: "p-admin", ...OWN_ADMIN }]])
		await expect(updateUserPermission(permanent.db, ADMIN, { permissionId: "p-admin", level: 2, expires_at: null })).resolves.toMatchObject({ success: true })
		expect(permanent.state.executed).toBe(1)
	})

	test("política da própria administração: desanexar, pôr prazo, apagar, remover o statement", async () => {
		const detach = stubDb(policyAdmin())
		expect((await caught(detachPolicy(detach.db, ADMIN, { userId: ADMIN_ID, policyId: "pol-1" })))?.code).toBe("GRANT_NOT_ALLOWED")

		const expiry = stubDb(policyAdmin())
		const expiryError = await caught(attachPolicy(expiry.db, ADMIN, { userId: ADMIN_ID, policyId: "pol-1", expires_at: "2999-01-01T00:00:00Z" }))
		expect(expiryError?.code).toBe("GRANT_NOT_ALLOWED")
		expect(expiryError?.message).toContain("prazo")

		const del = stubDb(policyAdmin(), [EDITABLE_POLICY])
		expect((await caught(deletePolicy(del.db, ADMIN, { policyId: "pol-1" })))?.code).toBe("GRANT_NOT_ALLOWED")

		const remove = stubDb(policyAdmin(), [[{ policyId: "pol-1", module: "admin", level: 2 }], EDITABLE_POLICY])
		expect((await caught(removePolicyStatement(remove.db, ADMIN, { statementId: "s-admin" })))?.code).toBe("GRANT_NOT_ALLOWED")

		for (const stub of [detach, expiry, del, remove]) expect(stub.state.executed).toBe(0)
	})

	test("restaurar uma política anexada ao ator que traz admin:0 é recusado", async () => {
		const snapshot = inlineAdmin()
		snapshot.policies = [{ id: "pol-1", deleted: true, statements: [{ id: "s-deny", module: "admin", level: 0, ...NO_SCOPE }] }]
		// leituras: a política (removida); o nome não colide
		const { db, state } = stubDb(snapshot, [DELETED_POLICY, []])
		expect((await caught(restorePolicy(db, ADMIN, { policyId: "pol-1" })))?.code).toBe("GRANT_NOT_ALLOWED")
		expect(state.executed).toBe(0)
	})
})
