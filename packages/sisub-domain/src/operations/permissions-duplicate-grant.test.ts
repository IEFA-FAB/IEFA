/**
 * Contrato do grant duplicado em `access_control.user_permissions`.
 *
 * `createUserPermission` insere DIRETO, sem checar se já existe. Enquanto a unicidade no
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
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { createUserPermission, isDuplicateGrantViolation, updateUserPermission } from "./permissions.ts"

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

/** Stub do handle Drizzle cujo `insert(...).values(...)` falha com o erro dado. */
function failingDb(error: unknown): SisubDb {
	return { insert: () => ({ values: () => Promise.reject(error) }) } as unknown as SisubDb
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

	test("erro sem forma de erro do Postgres não vira duplicata", () => {
		expect(isDuplicateGrantViolation(new Error("connection closed"))).toBe(false)
	})
})

describe("createUserPermission", () => {
	test("traduz a duplicata em PERMISSION_ALREADY_EXISTS apontando a concessão existente", async () => {
		const db = failingDb(driverError({ code: "23505", constraint_name: "user_permissions_allow_uniq" }))

		const error = (await createUserPermission(db, ADMIN, GRANT).then(
			() => null,
			(e: unknown) => e
		)) as DomainError

		expect(error).toBeInstanceOf(DomainError)
		expect(error.code).toBe("PERMISSION_ALREADY_EXISTS")
		// A mensagem nomeia o módulo e manda EDITAR — a tela mostra o grant que já existe,
		// inclusive o vencido, e renovar o prazo por lá é o caminho.
		expect(error.message).toContain("kitchen")
		expect(error.message).toContain("Edite a concessão existente")
		// Nada de SQL nem de SQLSTATE cru na tela.
		expect(error.message).not.toContain("23505")
	})

	test("falha de driver que NÃO é duplicata continua sendo INSERT_FAILED, com a causa preservada", async () => {
		const db = failingDb(driverError({ code: "CONNECT_TIMEOUT", message: "connection timeout" }))

		const error = (await createUserPermission(db, ADMIN, GRANT).then(
			() => null,
			(e: unknown) => e
		)) as DomainError

		expect(error.code).toBe("INSERT_FAILED")
		// `describeDriverError` e não `.message`: cru, seria só o SQL do insert.
		expect(error.message).toContain("CONNECT_TIMEOUT")
	})

	test("caminho feliz grava o escopo pedido e os demais como null", async () => {
		const gravado: Array<Record<string, unknown>> = []
		const db = {
			insert: () => ({
				values: (payload: Record<string, unknown>) => {
					gravado.push(payload)
					return Promise.resolve()
				},
			}),
		} as unknown as SisubDb

		await expect(createUserPermission(db, ADMIN, GRANT)).resolves.toEqual({ success: true })
		expect(gravado[0]).toEqual({
			userId: "user-2",
			module: "kitchen",
			level: 2,
			messHallId: null,
			kitchenId: 7,
			unitId: null,
			expiresAt: null,
		})
	})
})

// ---------------------------------------------------------------------------
// updateUserPermission — o MESMO índice, o mesmo vazamento
// ---------------------------------------------------------------------------

const EDIT = { permissionId: "perm-1", level: 2, kitchen_id: 7 } as const

/** Stub do `update(...).set(...).where(...).returning(...)` do Drizzle. */
function updateDb(outcome: { rows?: Array<{ id: string; userId: string }>; error?: unknown }): SisubDb {
	const chain = {
		set: () => chain,
		where: () => chain,
		returning: () => (outcome.error ? Promise.reject(outcome.error) : Promise.resolve(outcome.rows ?? [])),
	}
	return { update: () => chain } as unknown as SisubDb
}

describe("updateUserPermission", () => {
	test("mover o grant para um escopo que já existe vira PERMISSION_ALREADY_EXISTS, sem SQL cru", async () => {
		const db = updateDb({ error: driverError({ code: "23505", constraint_name: "user_permissions_allow_uniq" }) })

		const error = (await updateUserPermission(db, ADMIN, EDIT).then(
			() => null,
			(e: unknown) => e
		)) as DomainError

		expect(error.code).toBe("PERMISSION_ALREADY_EXISTS")
		expect(error.message).toContain("Ajuste ou remova a outra concessão")
		// Era isto que vazava no toast do administrador antes.
		expect(error.message).not.toContain("23505")
		expect(error.message).not.toContain("Failed query")
	})

	test("virar DENY sobre uma chave que já tem deny colide no outro índice, e traduz igual", async () => {
		const db = updateDb({ error: driverError({ code: "23505", constraint_name: "user_permissions_deny_uniq" }) })

		const error = (await updateUserPermission(db, ADMIN, { permissionId: "perm-1", level: 0 }).then(
			() => null,
			(e: unknown) => e
		)) as DomainError

		expect(error.code).toBe("PERMISSION_ALREADY_EXISTS")
	})

	test("WHERE que não casa continua sendo UPDATE_FAILED 'not found' — o contrato de mutateOrFail", async () => {
		const db = updateDb({ rows: [] })

		const error = (await updateUserPermission(db, ADMIN, EDIT).then(
			() => null,
			(e: unknown) => e
		)) as DomainError

		expect(error.code).toBe("UPDATE_FAILED")
		expect(error.message).toContain("not found")
	})

	test("falha de driver que não é duplicata segue UPDATE_FAILED com a causa preservada", async () => {
		const db = updateDb({ error: driverError({ code: "CONNECT_TIMEOUT", message: "connection timeout" }) })

		const error = (await updateUserPermission(db, ADMIN, EDIT).then(
			() => null,
			(e: unknown) => e
		)) as DomainError

		expect(error.code).toBe("UPDATE_FAILED")
		expect(error.message).toContain("CONNECT_TIMEOUT")
	})

	test("caminho feliz devolve o user_id da LINHA alterada, não do input", async () => {
		const db = updateDb({ rows: [{ id: "perm-1", userId: "user-2" }] })

		await expect(updateUserPermission(db, ADMIN, EDIT)).resolves.toEqual({ success: true, user_id: "user-2" })
	})
})
