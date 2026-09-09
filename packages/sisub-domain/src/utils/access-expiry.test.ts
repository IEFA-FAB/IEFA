/**
 * Congela o SQL do prazo de acesso.
 *
 * O que estes testes protegem não é aritmética de datas — é a FORMA da condição, porque
 * cada detalhe dela já foi uma decisão:
 *   - `IS NULL OR` é o que mantém permanente todo grant que existe hoje;
 *   - `now()` sem parâmetro é o que joga a comparação para o banco;
 *   - a ausência de `level` na condição é o que faz "expirado" significar AUSENTE e não
 *     deny.
 * O comportamento contra dados reais é provado no teste de integração
 * `permissions.operations.test.ts`.
 */

import { describe, expect, test } from "bun:test"
import { userPermissionsInAccessControl, userPolicyAttachmentInAccessControl } from "@iefa/database/drizzle/sisub"
import { and, eq } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { isExpired, notExpired } from "./access-expiry.ts"

const dialect = new PgDialect()
const render = (query: Parameters<PgDialect["sqlToQuery"]>[0]) => dialect.sqlToQuery(query)

describe("notExpired", () => {
	test("aceita a linha SEM prazo e a linha com prazo no futuro", () => {
		const { sql } = render(notExpired(userPermissionsInAccessControl.expiresAt))

		expect(sql).toContain('"expires_at" is null')
		expect(sql).toContain('"expires_at" > now()')
		expect(sql).toContain(" or ")
	})

	test("compara com now() do banco — nenhum instante viaja como parâmetro", () => {
		// Um ISO calculado em JS apareceria em `params`. Ele viria do relógio do processo, que
		// não é fonte da verdade para autorização: container adiantado revoga acesso vivo,
		// atrasado concede acesso vencido.
		const { params } = render(notExpired(userPermissionsInAccessControl.expiresAt))

		expect(params).toEqual([])
	})

	test("não menciona `level`: expirar é sumir, não virar deny", () => {
		// Se a expiração virasse deny, a precedência de `@iefa/pbac` mudaria de sentido — um
		// `level 0` vencido passaria a bloquear para sempre.
		const { sql } = render(notExpired(userPermissionsInAccessControl.expiresAt))

		expect(sql).not.toContain("level")
	})

	test("vale para o anexo de política com a MESMA forma", () => {
		const grant = render(notExpired(userPermissionsInAccessControl.expiresAt)).sql
		const attachment = render(notExpired(userPolicyAttachmentInAccessControl.expiresAt)).sql

		// Mesma condição, tabelas diferentes: as duas origens precisam caducar igual.
		expect(attachment.replace(/user_policy_attachment/g, "T")).toBe(grant.replace(/user_permissions/g, "T"))
	})

	test("compõe com os outros filtros dentro de um `and`", () => {
		const { sql } = render(
			and(eq(userPermissionsInAccessControl.userId, "u1"), notExpired(userPermissionsInAccessControl.expiresAt)) as Parameters<PgDialect["sqlToQuery"]>[0]
		)

		// O OR precisa vir parentizado, senão `A and B or C` colaria o `or` no `and` e
		// devolveria as linhas expiradas de OUTROS usuários.
		expect(sql).toContain('"user_id" = $1')
		expect(sql).toMatch(/\(.*is null.*or.*now\(\).*\)/)
	})
})

describe("isExpired", () => {
	test("linha sem prazo é `false`, não NULL", () => {
		// Sem o `is not null`, `NULL <= now()` devolveria NULL e a coluna "expirada?" viria
		// vazia justamente para as concessões permanentes — as que mais precisam aparecer
		// como vigentes.
		const { sql } = render(isExpired(userPolicyAttachmentInAccessControl.expiresAt))

		expect(sql).toContain("is not null")
		expect(sql).toContain("<= now()")
	})

	test("é o complemento exato de notExpired — mesmo `now()`, sem parâmetro", () => {
		const { params } = render(isExpired(userPolicyAttachmentInAccessControl.expiresAt))

		expect(params).toEqual([])
	})
})
