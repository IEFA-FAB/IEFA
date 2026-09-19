/**
 * Congela o SQL da leitura do registro de operações sensíveis.
 *
 * O que estes testes protegem é a FORMA das consultas, porque cada detalhe foi decisão:
 *   - o filtro por alvo casa a pessoa nas três chaves em que ela já foi gravada
 *     (`target_user_id`, e as legadas `userId`/`targetUserId`) E como alcançada por
 *     mudança de política (`affected_user_ids`) — sem o último braço, remover uma política
 *     não aparece no histórico de quem perdeu o acesso;
 *   - o `?` do jsonb sobrevive à renderização (os parâmetros do Postgres são `$n`);
 *   - o join do cadastro do alvo só faz cast para `uuid` quando o texto tem forma de uuid —
 *     um alvo legado malformado derrubaria a tela inteira;
 *   - o `total` usa o MESMO filtro da página.
 *
 * O banco não roda aqui: o `drizzle.mock()` monta as consultas de verdade e o `then` de
 * cada uma é interceptado para capturar o SQL e devolver linhas fixas.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { drizzle } from "drizzle-orm/postgres-js"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import { listSensitiveOperationNames, listSensitiveOperations } from "./audit.ts"

const ADMIN: UserContext = {
	userId: "11111111-1111-1111-1111-111111111111",
	permissions: [{ module: "admin", level: 3, kitchen_id: null, mess_hall_id: null, unit_id: null }],
	aal: 1,
	lastFactorAt: null,
	origin: "session",
}

const TARGET = "22222222-2222-2222-2222-222222222222"

type Captured = { sql: string; params: unknown[] }

/**
 * Handle Drizzle que monta a consulta real e, no `await`, grava o SQL em vez de executar.
 * `respond` escolhe as linhas de cada consulta pelo próprio SQL (a ordem dos `await` dentro
 * do `Promise.all` não é contrato).
 */
function recordingDb(respond: (query: Captured) => unknown[]): { db: SisubDb; captured: Captured[] } {
	const real = drizzle.mock()
	const captured: Captured[] = []

	const wrap = (builder: object): object =>
		new Proxy(builder, {
			get(target, prop, receiver) {
				if (prop === "then") {
					const query = (target as { toSQL: () => Captured }).toSQL()
					captured.push(query)
					return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(respond(query)).then(resolve, reject)
				}
				const value = Reflect.get(target, prop, receiver)
				if (typeof value !== "function") return value
				return (...args: unknown[]) => {
					const out = value.apply(target, args)
					return out && typeof out === "object" && "toSQL" in out ? wrap(out) : out
				}
			},
		})

	const db = new Proxy(real, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver)
			if (prop === "select" || prop === "selectDistinct") return (...args: unknown[]) => wrap(value.apply(target, args))
			return value
		},
	})
	return { db: db as unknown as SisubDb, captured }
}

const isCount = (q: Captured) => /count\(\*\)/i.test(q.sql)

async function runList(input: Parameters<typeof listSensitiveOperations>[2]) {
	const { db, captured } = recordingDb((q) => (isCount(q) ? [{ value: 7 }] : []))
	const result = await listSensitiveOperations(db, ADMIN, input)
	const page = captured.find((q) => !isCount(q))
	const total = captured.find(isCount)
	if (!page || !total) throw new Error("as duas consultas deviam ter rodado")
	return { result, page, total }
}

describe("listSensitiveOperations — filtro por alvo", () => {
	test("casa as três chaves de alvo direto e os alcançados por política", async () => {
		const { page } = await runList({ targetUserId: TARGET })

		expect(page.sql).toContain(`->> 'target_user_id' = $`)
		expect(page.sql).toContain(`->> 'userId' = $`)
		expect(page.sql).toContain(`->> 'targetUserId' = $`)
		expect(page.sql).toContain(`-> 'affected_user_ids' ? $`)
		// Um braço por chave, todos com o id como PARÂMETRO — nunca interpolado.
		expect(page.params.filter((p) => p === TARGET)).toHaveLength(4)
		expect(page.sql).not.toContain(TARGET)
	})

	test("os braços do alvo formam UM grupo entre parênteses — o `or` não vaza para o filtro de ator", async () => {
		const actor = "33333333-3333-3333-3333-333333333333"
		const { page } = await runList({ targetUserId: TARGET, actorId: actor })

		const where = page.sql.slice(page.sql.indexOf(" where "))
		expect(where).toMatch(/"actor_id" = \$\d+ and \(.*'target_user_id'.* or .*'affected_user_ids' \? \$\d+\)/)
		expect(page.params).toContain(actor)
	})

	test("o `?` do jsonb continua `?` — o parâmetro vem depois dele como `$n`", async () => {
		const { page } = await runList({ targetUserId: TARGET })
		const placeholders = page.sql.match(/\$\d+/g) ?? []
		expect(placeholders.length).toBe(page.params.length)
		expect(page.sql).toMatch(/'affected_user_ids' \? \$\d+/)
	})
})

describe("listSensitiveOperations — filtro por operação", () => {
	test("igualdade exata com o nome gravado", async () => {
		const { page } = await runList({ operation: "contrate.permission.grant" })

		expect(page.sql).toMatch(/"operation" = \$\d+/)
		expect(page.sql).not.toMatch(/ like /i)
		expect(page.params).toContain("contrate.permission.grant")
	})

	test("sem filtro nenhum, não há `where`", async () => {
		const { page, total } = await runList({})
		expect(page.sql).not.toContain(" where ")
		expect(total.sql).not.toContain(" where ")
	})
})

describe("listSensitiveOperations — total e alvo legível", () => {
	test("o total usa exatamente o filtro da página", async () => {
		const { page, total, result } = await runList({ targetUserId: TARGET, operation: "attachPolicyFn", actorId: ADMIN.userId })

		const pageWhere = page.sql.slice(page.sql.indexOf(" where "), page.sql.indexOf(" order by "))
		const totalWhere = total.sql.slice(total.sql.indexOf(" where "))
		expect(totalWhere).toBe(pageWhere)
		expect(result.total).toBe(7)
	})

	test("o e-mail do alvo vem de um segundo join em `core.user_data`, LEFT, com cast guardado", async () => {
		const { page } = await runList({})

		expect(page.sql).toContain(`left join "core"."user_data" "target_user"`)
		// O cast só acontece dentro do `case` que confere a forma de uuid.
		expect(page.sql).toMatch(/case when coalesce\(.*'target_user_id'.*'userId'.*'targetUserId'\) ~\* '\^\[0-9a-f\]\{8\}-.*then \(coalesce\(.*\)\)::uuid end/)
		expect(page.sql).toMatch(/"target_user"\."email"/)
	})

	test("o tamanho da página é reaplicado na operation", async () => {
		const { page } = await runList({ limit: 10_000 })
		expect(page.params).toContain(200)
	})
})

describe("listSensitiveOperationNames", () => {
	test("select distinct dos nomes, em ordem", async () => {
		const { db, captured } = recordingDb(() => [{ operation: "attachPolicyFn" }, { operation: "forms.viewer.grant" }])
		const names = await listSensitiveOperationNames(db, ADMIN)

		expect(names).toEqual(["attachPolicyFn", "forms.viewer.grant"])
		expect(captured[0]?.sql).toMatch(
			/^select distinct "operation" from "access_control"\."sensitive_operation_log" order by "access_control"\."sensitive_operation_log"\."operation" asc/
		)
	})

	test("exige `admin` nível 3, como a leitura do registro", async () => {
		const { db, captured } = recordingDb(() => [])
		const weaker: UserContext = { ...ADMIN, permissions: [{ module: "admin", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }] }

		await expect(listSensitiveOperationNames(db, weaker)).rejects.toBeInstanceOf(PermissionDeniedError)
		await expect(listSensitiveOperations(db, weaker, {})).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(captured).toEqual([])
	})
})
