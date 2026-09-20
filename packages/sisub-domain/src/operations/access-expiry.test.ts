/**
 * Contrato do prazo de concessão.
 *
 * Duas propriedades sustentam a feature inteira, e as duas são fáceis de perder numa
 * refatoração sem que nada quebre visivelmente:
 *
 *   1. a comparação acontece no BANCO (`now()`), não no processo — um `Date` do JS
 *      viajando como parâmetro faria a autorização depender do relógio do container;
 *   2. concessão vencida é AUSENTE — o resolver nunca vê a linha, então um deny vencido
 *      deixa de negar em vez de continuar cancelando allows vivos.
 *
 * (1) é verificável no SQL gerado. (2) é verificável na resolução, alimentando o resolver
 * com e sem a linha e comparando as decisões.
 */

import { describe, expect, test } from "bun:test"
import { userPermissionsInAccessControl, userPolicyAttachmentInAccessControl } from "@iefa/database/drizzle/sisub"
import { hasPermission, resolveEffectivePermissions, type UserPermission } from "@iefa/pbac"
import { PgDialect } from "drizzle-orm/pg-core"
import { isActiveGrant, isExpiredGrant } from "./access-expiry.ts"

const dialect = new PgDialect()

function render(sql: Parameters<PgDialect["sqlToQuery"]>[0]) {
	const query = dialect.sqlToQuery(sql)
	return { sql: query.sql, params: query.params }
}

describe("isActiveGrant", () => {
	test("aceita a linha sem prazo e a linha com prazo no futuro, no MESMO predicado", () => {
		const { sql } = render(isActiveGrant(userPermissionsInAccessControl.expiresAt))
		expect(sql).toContain('"expires_at" is null')
		expect(sql).toContain('"expires_at" > now()')
		expect(sql).toContain(" or ")
	})

	test("o instante vem do banco: nenhum parâmetro é vinculado à query", () => {
		// Um `Date` do JS aqui apareceria como $1. É exatamente o que não pode acontecer:
		// autorização comparada com o relógio do processo aceita grant vencido em container
		// com clock atrasado e recusa grant vivo em container adiantado.
		expect(render(isActiveGrant(userPermissionsInAccessControl.expiresAt)).params).toEqual([])
		expect(render(isActiveGrant(userPolicyAttachmentInAccessControl.expiresAt)).params).toEqual([])
	})

	test("serve às duas origens do PBAC com a mesma forma", () => {
		const grant = render(isActiveGrant(userPermissionsInAccessControl.expiresAt)).sql
		const attachment = render(isActiveGrant(userPolicyAttachmentInAccessControl.expiresAt)).sql
		expect(grant.replace(/user_permissions/g, "T")).toBe(attachment.replace(/user_policy_attachment/g, "T"))
	})
})

describe("isExpiredGrant", () => {
	test("linha SEM prazo nunca é expirada — null não pode virar vencido", () => {
		const { sql } = render(isExpiredGrant(userPermissionsInAccessControl.expiresAt))
		expect(sql).toContain('"expires_at" is not null')
		expect(sql).toContain('"expires_at" <= now()')
	})

	test("também compara pelo relógio do banco", () => {
		expect(render(isExpiredGrant(userPermissionsInAccessControl.expiresAt)).params).toEqual([])
	})
})

/**
 * A consequência de filtrar na query, e não depois: a linha vencida simplesmente NÃO ESTÁ
 * no conjunto que o resolver recebe. Estes casos congelam o que isso significa em decisão.
 */
describe("expirado é ausente, não deny", () => {
	const allowKitchen: UserPermission = { module: "kitchen", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }
	const denyKitchen: UserPermission = { module: "kitchen", level: 0, kitchen_id: null, mess_hall_id: null, unit_id: null }

	test("grant vigente (prazo null ou futuro) concede — a linha chega ao resolver", () => {
		const permissions = resolveEffectivePermissions([allowKitchen])
		expect(hasPermission(permissions, "kitchen", 2)).toBe(true)
	})

	test("grant vencido não concede — a linha não chega", () => {
		const permissions = resolveEffectivePermissions([])
		expect(hasPermission(permissions, "kitchen", 1)).toBe(false)
	})

	test("DENY vencido deixa de negar: o allow de outra origem volta a valer", () => {
		// Com o deny presente (vigente), ele vence — é a precedência de deny do PBAC.
		const withDeny = resolveEffectivePermissions([denyKitchen], [allowKitchen])
		expect(hasPermission(withDeny, "kitchen", 2)).toBe(false)

		// Vencido, o deny é filtrado na origem e o allow sobrevive. Transformar expiração em
		// deny (em vez de ausência) produziria o resultado da linha de cima para sempre.
		const denyExpired = resolveEffectivePermissions([], [allowKitchen])
		expect(hasPermission(denyExpired, "kitchen", 2)).toBe(true)
	})

	test("deny vencido de `diner` devolve o comensal implícito", () => {
		const denyDiner: UserPermission = { module: "diner", level: 0, kitchen_id: null, mess_hall_id: null, unit_id: null }
		expect(hasPermission(resolveEffectivePermissions([denyDiner]), "diner", 1)).toBe(false)
		// Vencido, ele some do conjunto e a injeção implícita volta a acontecer.
		expect(hasPermission(resolveEffectivePermissions([]), "diner", 1)).toBe(true)
	})
})
