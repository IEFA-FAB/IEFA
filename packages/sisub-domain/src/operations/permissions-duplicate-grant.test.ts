/**
 * Contrato do grant duplicado em `access_control.user_permissions`.
 *
 * `createUserPermission` é ESTRITA: não checa se já existe. Enquanto a unicidade no
 * banco era parcial (só `rumaer` e o `sucont` legado), dois cliques no diálogo — ou dois
 * administradores ao mesmo tempo — gravavam duas linhas do mesmo módulo e escopo: a
 * pessoa aparecia duas vezes na tela de acessos e revogar apagava só uma, deixando a
 * outra concedendo. Desde 20260917185655 quem recusa a segunda linha são
 * `user_permissions_allow_uniq` (`level > 0`) e `user_permissions_deny_uniq`
 * (`level <= 0`), em QUALQUER módulo e QUALQUER escopo.
 *
 * São DOIS índices, e não um geral, porque allow e deny coexistem na mesma chave — é o
 * deny sobre allow, que a resolução aplica por precedência. O detector aqui tem de
 * reconhecer os dois nomes, e SÓ eles.
 *
 * O que este teste fixa é o que a recusa vira para quem está na tela: uma mensagem que
 * diz o que fazer, e não o 23505 cru — nos DOIS caminhos de escrita (criar e editar) — e,
 * principalmente, que ela NÃO engole as outras falhas de driver.
 *
 * Desde 20260921120000 a escrita é a função SQL auditada (`access_control.create_user_permission`
 * e irmãs), que traduz a violação no token `PERMISSION_ALREADY_EXISTS` (23505) e grava o log de
 * auditoria na mesma transação. Os stubs abaixo simulam o `db.execute` dessa chamada.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { createUserPermission, deleteUserPermission, isDuplicateGrantViolation, updateUserPermission } from "./permissions.ts"

const ADMIN: UserContext = {
	userId: "user-1",
	permissions: [{ module: "admin", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }],
	aal: 1,
	lastFactorAt: null,
	origin: "session",
}

const GRANT = { userId: "user-2", module: "kitchen", level: 2, kitchen_id: 7 } as const

/**
 * Erro do driver como ele chega de verdade: o drizzle embrulha a falha e o `.code` /
 * `.constraint_name` do postgres.js ficam em `.cause`. Checar o topo não reconheceria nada.
 */
function driverError(cause: { code?: string; constraint_name?: string; message?: string }): Error {
	return Object.assign(new Error("Failed query: insert into ..."), { cause })
}

type ExistingRow = { id: string; userId: string; module: string; level: number }

/**
 * Stub do handle Drizzle: `execute` é a chamada da função auditada (falha com `error` ou devolve
 * `result`); `select` é a leitura da linha que update/delete fazem antes, para a regra de
 * autoconcessão. As chamadas ficam em `calls`, renderizadas como a query que iria ao banco.
 */
function accessDb(outcome: { error?: unknown; result?: Record<string, unknown>; existing?: ExistingRow | null }) {
	const calls: Array<{ sql: string; params: unknown[] }> = []
	const dialect = new PgDialect()
	const existing = outcome.existing === undefined ? { id: "perm-1", userId: "user-2", module: "kitchen", level: 1 } : outcome.existing
	const db = {
		execute: (query: SQL) => {
			calls.push(dialect.sqlToQuery(query))
			if (outcome.error) return Promise.reject(outcome.error)
			return Promise.resolve([{ result: outcome.result ?? { log_id: "log-1", permission_id: "perm-1", user_id: "user-2" } }])
		},
		select: () => ({
			from: () => ({
				where: () => ({ limit: () => Promise.resolve(existing === null ? [] : [existing]) }),
			}),
		}),
	} as unknown as SisubDb
	return { db, calls }
}

/** O mesmo erro, como a função auditada o levanta (token na mensagem, SQLSTATE no código). */
function functionError(token: string, code: string): Error {
	return driverError({ code, message: token })
}

/** Resolve para o erro lançado (ou `null`), para as asserções sobre código e mensagem. */
function caught(promise: Promise<unknown>): Promise<DomainError | null> {
	return promise.then(
		() => null,
		(e: unknown) => e as DomainError
	)
}

describe("isDuplicateGrantViolation", () => {
	test("reconhece o 23505 do allow duplicado escondido em .cause", () => {
		expect(isDuplicateGrantViolation(driverError({ code: "23505", constraint_name: "user_permissions_allow_uniq" }))).toBe(true)
	})

	test("reconhece também o 23505 do DENY duplicado — os dois índices contam", () => {
		expect(isDuplicateGrantViolation(driverError({ code: "23505", constraint_name: "user_permissions_deny_uniq" }))).toBe(true)
	})

	test("não confunde com a unicidade de OUTRA tabela", () => {
		expect(isDuplicateGrantViolation(driverError({ code: "23505", constraint_name: "user_email_email_key" }))).toBe(false)
	})

	test("não confunde com outro SQLSTATE na mesma constraint", () => {
		expect(isDuplicateGrantViolation(driverError({ code: "23503", constraint_name: "user_permissions_allow_uniq" }))).toBe(false)
	})

	test("reconhece o token da função auditada (20260921120000)", () => {
		expect(isDuplicateGrantViolation(functionError("PERMISSION_ALREADY_EXISTS", "23505"))).toBe(true)
		expect(isDuplicateGrantViolation(functionError("POLICY_NAME_TAKEN", "23505"))).toBe(false)
	})

	test("erro sem forma de erro do Postgres não vira duplicata", () => {
		expect(isDuplicateGrantViolation(new Error("connection closed"))).toBe(false)
	})
})

describe("createUserPermission", () => {
	test("traduz a duplicata em PERMISSION_ALREADY_EXISTS apontando a concessão existente", async () => {
		const error = await caught(createUserPermission(accessDb({ error: functionError("PERMISSION_ALREADY_EXISTS", "23505") }).db, ADMIN, GRANT))

		expect(error).toBeInstanceOf(DomainError)
		expect(error?.code).toBe("PERMISSION_ALREADY_EXISTS")
		// A mensagem nomeia o módulo e manda EDITAR — a tela mostra o grant que já existe,
		// inclusive o vencido, e renovar o prazo por lá é o caminho.
		expect(error?.message).toContain("kitchen")
		expect(error?.message).toContain("Edite a concessão existente")
		// Nada de SQL nem de SQLSTATE cru na tela.
		expect(error?.message).not.toContain("23505")
	})

	test("falha de driver que NÃO é duplicata continua sendo INSERT_FAILED, com a causa preservada", async () => {
		const error = await caught(
			createUserPermission(accessDb({ error: driverError({ code: "CONNECT_TIMEOUT", message: "connection timeout" }) }).db, ADMIN, GRANT)
		)

		expect(error?.code).toBe("INSERT_FAILED")
		// `describeDriverError` e não `.message`: cru, seria só o SQL.
		expect(error?.message).toContain("CONNECT_TIMEOUT")
	})

	test("caminho feliz chama a função auditada com o ATOR DA SESSÃO, o escopo pedido e os demais nulos", async () => {
		const { db, calls } = accessDb({})

		await expect(createUserPermission(db, ADMIN, GRANT, undefined, { operation: "createUserPermissionFn", grade: "fresh" })).resolves.toEqual({
			success: true,
			log_id: "log-1",
			permission_id: "perm-1",
		})
		expect(calls[0].sql).toContain("access_control.create_user_permission(")
		// ator, operação, usuário, módulo, nível, unit, kitchen, mess_hall, prazo, grau
		expect(calls[0].params).toEqual(["user-1", "createUserPermissionFn", "user-2", "kitchen", 2, null, 7, null, null, "fresh"])
	})

	test("o administrador pode conceder a si mesmo, mas não BLOQUEAR a própria administração", async () => {
		await expect(createUserPermission(accessDb({}).db, ADMIN, { userId: "user-1", module: "kitchen", level: 2 })).resolves.toMatchObject({ success: true })
		const error = await caught(createUserPermission(accessDb({}).db, ADMIN, { userId: "user-1", module: "admin", level: 0 }))
		expect(error?.code).toBe("GRANT_NOT_ALLOWED")
	})
})

// ---------------------------------------------------------------------------
// updateUserPermission — o MESMO índice, o mesmo vazamento
// ---------------------------------------------------------------------------

const EDIT = { permissionId: "perm-1", level: 2, kitchen_id: 7 } as const

describe("updateUserPermission", () => {
	test("mover o grant para um escopo que já existe vira PERMISSION_ALREADY_EXISTS, sem SQL cru", async () => {
		const error = await caught(updateUserPermission(accessDb({ error: functionError("PERMISSION_ALREADY_EXISTS", "23505") }).db, ADMIN, EDIT))

		expect(error?.code).toBe("PERMISSION_ALREADY_EXISTS")
		expect(error?.message).toContain("Ajuste ou remova a outra concessão")
		// Era isto que vazava no toast do administrador antes.
		expect(error?.message).not.toContain("23505")
		expect(error?.message).not.toContain("Failed query")
	})

	test("grant inexistente continua sendo UPDATE_FAILED 'not found' — também quando some entre a leitura e a escrita", async () => {
		const missing = await caught(updateUserPermission(accessDb({ existing: null }).db, ADMIN, EDIT))
		expect(missing?.code).toBe("UPDATE_FAILED")
		expect(missing?.message).toContain("not found")

		const raced = await caught(updateUserPermission(accessDb({ error: functionError("PERMISSION_NOT_FOUND", "P0002") }).db, ADMIN, EDIT))
		expect(raced?.code).toBe("UPDATE_FAILED")
	})

	test("falha de driver que não é duplicata segue UPDATE_FAILED com a causa preservada", async () => {
		const error = await caught(
			updateUserPermission(accessDb({ error: driverError({ code: "CONNECT_TIMEOUT", message: "connection timeout" }) }).db, ADMIN, EDIT)
		)

		expect(error?.code).toBe("UPDATE_FAILED")
		expect(error?.message).toContain("CONNECT_TIMEOUT")
	})

	test("prazo ausente é PATCH (não mexe); nulo explícito limpa", async () => {
		const absent = accessDb({})
		await updateUserPermission(absent.db, ADMIN, EDIT)
		// …, prazo, p_set_expires_at, grau
		expect(absent.calls[0].params.slice(-3)).toEqual([null, false, "session"])

		const cleared = accessDb({})
		await updateUserPermission(cleared.db, ADMIN, { ...EDIT, expires_at: null })
		expect(cleared.calls[0].params.slice(-3)).toEqual([null, true, "session"])
	})

	test("caminho feliz devolve o user_id da LINHA alterada, não do input", async () => {
		const { db } = accessDb({ result: { log_id: "log-1", permission_id: "perm-1", user_id: "user-2" } })

		await expect(updateUserPermission(db, ADMIN, EDIT)).resolves.toEqual({ success: true, user_id: "user-2", log_id: "log-1" })
	})

	test("ninguém rebaixa a própria administração; subir o próprio nível pode", async () => {
		const own = { id: "perm-1", userId: "user-1", module: "admin", level: 3 }
		const error = await caught(updateUserPermission(accessDb({ existing: own }).db, ADMIN, { permissionId: "perm-1", level: 2 }))
		expect(error?.code).toBe("GRANT_NOT_ALLOWED")

		await expect(updateUserPermission(accessDb({ existing: { ...own, level: 2 } }).db, ADMIN, { permissionId: "perm-1", level: 3 })).resolves.toMatchObject({
			success: true,
		})
	})
})

describe("deleteUserPermission", () => {
	test("devolve o que foi removido, lido do retorno da função (não do input)", async () => {
		const { db } = accessDb({ result: { log_id: "log-9", permission_id: "perm-1", user_id: "user-2", module: "kitchen", level: 2 } })
		await expect(deleteUserPermission(db, ADMIN, { permissionId: "perm-1" })).resolves.toEqual({
			success: true,
			log_id: "log-9",
			removed: { id: "perm-1", userId: "user-2", module: "kitchen", level: 2 },
		})
	})

	test("ninguém revoga a própria administração; o próprio bloqueio pode sair", async () => {
		const error = await caught(
			deleteUserPermission(accessDb({ existing: { id: "p", userId: "user-1", module: "admin", level: 2 } }).db, ADMIN, { permissionId: "p" })
		)
		expect(error?.code).toBe("GRANT_NOT_ALLOWED")

		await expect(
			deleteUserPermission(accessDb({ existing: { id: "p", userId: "user-1", module: "admin", level: 0 } }).db, ADMIN, { permissionId: "p" })
		).resolves.toMatchObject({ success: true })
	})
})
