/**
 * Ninguém encerra a PRÓPRIA administração — nem por nível, nem por prazo, nem pela política
 * que a concede.
 *
 * A primeira versão da regra só pegava o nível mais baixo: um administrador ainda se trancava
 * fora do console pondo `expires_at` no passado (ou qualquer prazo) no próprio grant de
 * `admin`. A decisão: na própria administração, pode SUBIR o nível e torná-la PERMANENTE; não
 * pode baixar, virar bloqueio, nem pôr prazo nenhum. O mesmo vale quando a administração vem de
 * política anexada ao ator.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import type { DomainError } from "../types/errors.ts"
import { selfAdminUpdateRefusal } from "./access-change.ts"
import { updateUserPermission } from "./permissions.ts"
import { attachPolicy, deletePolicy, detachPolicy, removePolicyStatement, updatePolicyStatement } from "./policies.ts"

const ADMIN_ID = "admin-1"
const ADMIN: UserContext = {
	userId: ADMIN_ID,
	permissions: [{ module: "admin", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }],
	aal: 1,
	lastFactorAt: null,
	origin: "session",
}

const OWN_ADMIN = { userId: ADMIN_ID, module: "admin", level: 2 }

describe("selfAdminUpdateRefusal", () => {
	test("própria administração: baixar o nível ou pôr QUALQUER prazo é recusado", () => {
		expect(selfAdminUpdateRefusal(ADMIN_ID, OWN_ADMIN, { level: 1 })).toBe("LEVEL")
		expect(selfAdminUpdateRefusal(ADMIN_ID, OWN_ADMIN, { level: 0 })).toBe("LEVEL")
		expect(selfAdminUpdateRefusal(ADMIN_ID, OWN_ADMIN, { level: 2, expiresAt: "2000-01-01T00:00:00Z" })).toBe("EXPIRY")
		// Prazo futuro também tranca — só que depois.
		expect(selfAdminUpdateRefusal(ADMIN_ID, OWN_ADMIN, { level: 3, expiresAt: "2999-01-01T00:00:00Z" })).toBe("EXPIRY")
	})

	test("própria administração: subir o nível, torná-la permanente ou não mexer no prazo pode", () => {
		expect(selfAdminUpdateRefusal(ADMIN_ID, OWN_ADMIN, { level: 3 })).toBeNull()
		expect(selfAdminUpdateRefusal(ADMIN_ID, OWN_ADMIN, { level: 2, expiresAt: null })).toBeNull()
		expect(selfAdminUpdateRefusal(ADMIN_ID, OWN_ADMIN, { level: 2, expiresAt: undefined })).toBeNull()
	})

	test("o grant de outra pessoa, de outro módulo ou um bloqueio próprio não é administração a proteger", () => {
		expect(selfAdminUpdateRefusal(ADMIN_ID, { ...OWN_ADMIN, userId: "other" }, { level: 0, expiresAt: "2000-01-01T00:00:00Z" })).toBeNull()
		expect(selfAdminUpdateRefusal(ADMIN_ID, { ...OWN_ADMIN, module: "kitchen" }, { level: 0, expiresAt: "2000-01-01T00:00:00Z" })).toBeNull()
		expect(selfAdminUpdateRefusal(ADMIN_ID, { ...OWN_ADMIN, level: 0 }, { level: 0, expiresAt: "2000-01-01T00:00:00Z" })).toBeNull()
	})
})

/**
 * Stub do Drizzle. `selects` responde às leituras NA ORDEM em que a operação as faz; `execute`
 * (a função auditada) só pode ser alcançado quando a operação é permitida — `executed` conta.
 */
function stubDb(selects: unknown[][]) {
	const queue = [...selects]
	const state = { executed: 0 }
	const chain = {
		from: () => chain,
		where: () => chain,
		limit: () => Promise.resolve(queue.shift() ?? []),
	}
	const db = {
		select: () => chain,
		execute: () => {
			state.executed++
			return Promise.resolve([{ result: { log_id: "log-1", change: "expiry", statement_id: "s1", permission_id: "p1", user_id: ADMIN_ID } }])
		},
	} as unknown as SisubDb
	return { db, state }
}

const caught = (promise: Promise<unknown>) =>
	promise.then(
		() => null,
		(e: unknown) => e as DomainError
	)

const EDITABLE_POLICY = [{ id: "pol-1", name: "Admins", description: null, managed: false, created_at: "", deleted_at: null }]

describe("updateUserPermission sobre a própria administração", () => {
	test("pôr prazo (vencido ou futuro) é recusado ANTES de tocar o banco de escrita", async () => {
		for (const expires_at of ["2000-01-01T00:00:00Z", "2999-01-01T00:00:00Z"]) {
			const { db, state } = stubDb([[{ id: "p1", ...OWN_ADMIN }]])
			const error = await caught(updateUserPermission(db, ADMIN, { permissionId: "p1", level: 2, expires_at }))
			expect(error?.code).toBe("GRANT_NOT_ALLOWED")
			expect(error?.message).toContain("prazo")
			expect(state.executed).toBe(0)
		}
	})

	test("tornar permanente passa", async () => {
		const { db, state } = stubDb([[{ id: "p1", ...OWN_ADMIN }]])
		await expect(updateUserPermission(db, ADMIN, { permissionId: "p1", level: 2, expires_at: null })).resolves.toMatchObject({ success: true })
		expect(state.executed).toBe(1)
	})
})

describe("administração por política anexada ao ator", () => {
	test("desanexar a própria política de administração é recusado; a de outra pessoa, não", async () => {
		const own = stubDb([[{ id: "st-admin" }]])
		expect((await caught(detachPolicy(own.db, ADMIN, { userId: ADMIN_ID, policyId: "pol-1" })))?.code).toBe("GRANT_NOT_ALLOWED")
		expect(own.state.executed).toBe(0)

		const other = stubDb([])
		await expect(detachPolicy(other.db, ADMIN, { userId: "other", policyId: "pol-1" })).resolves.toMatchObject({ success: true })
	})

	test("pôr prazo no PRÓPRIO anexo de administração é recusado; anexar-se com prazo pela primeira vez pode", async () => {
		// leituras: isAttachedTo → sim; policyGrantsAdmin → sim
		const renew = stubDb([[{ id: "att-1" }], [{ id: "st-admin" }]])
		const error = await caught(attachPolicy(renew.db, ADMIN, { userId: ADMIN_ID, policyId: "pol-1", expires_at: "2999-01-01T00:00:00Z" }))
		expect(error?.code).toBe("GRANT_NOT_ALLOWED")
		expect(renew.state.executed).toBe(0)

		const first = stubDb([[]])
		await expect(attachPolicy(first.db, ADMIN, { userId: ADMIN_ID, policyId: "pol-1", expires_at: "2999-01-01T00:00:00Z" })).resolves.toMatchObject({
			success: true,
		})
	})

	test("apagar a política que dá administração ao ator é recusado", async () => {
		// leituras: assertPolicyEditable → política; isAttachedTo → sim; policyGrantsAdmin → sim
		const { db, state } = stubDb([EDITABLE_POLICY, [{ id: "att-1" }], [{ id: "st-admin" }]])
		expect((await caught(deletePolicy(db, ADMIN, { policyId: "pol-1" })))?.code).toBe("GRANT_NOT_ALLOWED")
		expect(state.executed).toBe(0)
	})

	test("remover ou rebaixar o statement de administração de uma política anexada ao ator é recusado", async () => {
		const statement = [{ policyId: "pol-1", module: "admin", level: 2 }]
		// leituras: loadStatement → admin; assertPolicyEditable → política; isAttachedTo → sim
		const remove = stubDb([statement, EDITABLE_POLICY, [{ id: "att-1" }]])
		expect((await caught(removePolicyStatement(remove.db, ADMIN, { statementId: "s1" })))?.code).toBe("GRANT_NOT_ALLOWED")

		const lower = stubDb([statement, EDITABLE_POLICY, [{ id: "att-1" }]])
		expect((await caught(updatePolicyStatement(lower.db, ADMIN, { statementId: "s1", statement: { module: "admin", level: 1 } })))?.code).toBe(
			"GRANT_NOT_ALLOWED"
		)

		// Subir o nível do mesmo statement não tranca ninguém.
		const raise = stubDb([statement, EDITABLE_POLICY])
		await expect(updatePolicyStatement(raise.db, ADMIN, { statementId: "s1", statement: { module: "admin", level: 3 } })).resolves.toBeDefined()
		expect(raise.state.executed).toBe(1)
	})
})
