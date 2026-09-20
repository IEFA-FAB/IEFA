import { describe, expect, test } from "bun:test"
import { hasPermission } from "./has-permission.ts"
import { resolveUserPermissions } from "./resolve-permissions.ts"
import type { UserPermission } from "./types.ts"

/** Filtro `or` que a query aplicou — capturado para as asserções sobre o prazo. */
let lastOrFilter: string | null = null

function createSupabaseStub(rows: UserPermission[], error: { message: string } | null = null) {
	lastOrFilter = null
	return {
		from(table: string) {
			expect(table).toBe("user_permissions")
			return {
				select(columns: string) {
					expect(columns).toBe("module, level, mess_hall_id, kitchen_id, unit_id")
					return {
						eq(column: string, userId: string) {
							expect(column).toBe("user_id")
							expect(userId).toBe("user-1")
							return {
								or(filter: string) {
									lastOrFilter = filter
									return { data: rows, error }
								},
							}
						},
					}
				},
			}
		},
	}
}

describe("resolveUserPermissions", () => {
	test("injeta diner level 1 quando não há regra explícita de diner", async () => {
		const rows: UserPermission[] = [{ module: "kitchen", level: 2, kitchen_id: 11, mess_hall_id: null, unit_id: null }]

		const permissions = await resolveUserPermissions("user-1", createSupabaseStub(rows) as never)

		expect(permissions).toContainEqual({ module: "diner", level: 1, kitchen_id: null, mess_hall_id: null, unit_id: null })
		expect(permissions).toContainEqual(rows[0])
	})

	test("deny explícito não concede, e permanece para o guard poder negar", async () => {
		const rows: UserPermission[] = [
			{ module: "kitchen", level: 0, kitchen_id: 11, mess_hall_id: null, unit_id: null },
			{ module: "unit", level: 2, unit_id: 3, kitchen_id: null, mess_hall_id: null },
		]

		const permissions = await resolveUserPermissions("user-1", createSupabaseStub(rows) as never)

		// O deny fica no conjunto — é o que permite negar a cozinha 11 mesmo quando um allow
		// SEM escopo existe. Com level 0 ele nunca satisfaz `level >= minLevel`.
		expect(hasPermission(permissions, "kitchen", 1, { type: "kitchen", id: 11 })).toBe(false)
		expect(permissions).toContainEqual(rows[1])
	})

	test("não injeta diner implícito quando existe regra explícita de diner", async () => {
		const rows: UserPermission[] = [{ module: "diner", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }]

		const permissions = await resolveUserPermissions("user-1", createSupabaseStub(rows) as never)

		expect(permissions).toEqual(rows)
	})

	test("filtra a concessão vencida NA QUERY, aceitando prazo nulo ou futuro", async () => {
		await resolveUserPermissions("user-1", createSupabaseStub([]) as never)

		// `is.null` = concessão permanente (o default). `gt.now` usa o valor de entrada especial
		// do Postgres: quem compara é o banco, no instante da transação. Um `new Date()` serializado
		// aqui faria a autorização depender do relógio do processo.
		expect(lastOrFilter).toBe("expires_at.is.null,expires_at.gt.now")
		expect(lastOrFilter).not.toContain("T00:00")
	})

	test("linha vencida some do conjunto — deny expirado deixa de negar", async () => {
		// A query já não devolve a linha vencida, então o deny simplesmente não existe para o
		// resolver: `kitchen` volta a ser concedido pelo allow que sobreviveu. Se a expiração
		// fosse tratada como deny, esta asserção seria false.
		const rows: UserPermission[] = [{ module: "kitchen", level: 2, kitchen_id: 11, mess_hall_id: null, unit_id: null }]

		const permissions = await resolveUserPermissions("user-1", createSupabaseStub(rows) as never)

		expect(hasPermission(permissions, "kitchen", 2, { type: "kitchen", id: 11 })).toBe(true)
	})

	test("propaga erro de consulta com mensagem sanitizada", async () => {
		const promise = resolveUserPermissions("user-1", createSupabaseStub([], { message: "database unavailable" }) as never)

		await expect(promise).rejects.toThrow("Falha ao buscar permissões: database unavailable")
	})
})
