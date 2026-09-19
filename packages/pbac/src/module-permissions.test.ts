import { describe, expect, test } from "bun:test"
import { myModulePermissionsQueryConfig, resolveModulePermissions, searchUsersByEmail } from "./module-permissions.ts"
import type { UserPermission } from "./types.ts"

// ---------------------------------------------------------------------------
// myModulePermissionsQueryConfig
// ---------------------------------------------------------------------------

describe("myModulePermissionsQueryConfig", () => {
	test("mantém o contrato da queryKey [module, 'myPermissions'] usado pelos apps", async () => {
		const fetcher = async (): Promise<UserPermission[]> => []

		const config = myModulePermissionsQueryConfig("rumaer", fetcher)

		expect(config.queryKey).toEqual(["rumaer", "myPermissions"])
		expect(config.queryFn).toBe(fetcher)
		expect(config.staleTime).toBe(1000 * 60 * 30)
		expect(config.gcTime).toBe(1000 * 60 * 60)
	})
})

// ---------------------------------------------------------------------------
// resolveModulePermissions
// ---------------------------------------------------------------------------

function createResolveStub(rows: UserPermission[]) {
	return {
		// A resolução também sonda `user_policy_attachment`; sem política anexada esse
		// caminho para na primeira query. Ver `resolve-permissions.test.ts`.
		from(table: string) {
			return {
				select() {
					return {
						eq() {
							// `.or(...)` é o filtro de expiração; sem política anexada a sonda de
							// `user_policy_attachment` devolve vazio.
							return { or: () => ({ data: table === "user_permissions" ? rows : [], error: null }) }
						},
					}
				},
			}
		},
	}
}

describe("resolveModulePermissions", () => {
	test("devolve apenas grants do módulo pedido (sem vazar cross-app)", async () => {
		const rows: UserPermission[] = [
			{ module: "rumaer", level: 3, kitchen_id: null, mess_hall_id: null, unit_id: null },
			{ module: "global", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null },
		]

		const permissions = await resolveModulePermissions("user-1", createResolveStub(rows) as never, "rumaer")

		expect(permissions).toEqual([rows[0] as UserPermission])
	})

	test("não devolve o diner implícito injetado pela resolução", async () => {
		const permissions = await resolveModulePermissions("user-1", createResolveStub([]) as never, "sucont-4")

		expect(permissions).toEqual([])
	})
})

// ---------------------------------------------------------------------------
// searchUsersByEmail
// ---------------------------------------------------------------------------

type SearchRow = { id: string; email: string | null; nrOrdem: string | null }

function createSearchStub(rows: SearchRow[], captured: { pattern?: string } = {}) {
	return {
		from(table: string) {
			expect(table).toBe("user_data")
			return {
				select(columns: string) {
					expect(columns).toBe("id, email, nrOrdem")
					return {
						ilike(_column: string, pattern: string) {
							captured.pattern = pattern
							return {
								order() {
									return {
										limit() {
											return { data: rows, error: null }
										},
									}
								},
							}
						},
					}
				},
			}
		},
	}
}

describe("searchUsersByEmail", () => {
	test("normaliza email/nrOrdem nulos e devolve as linhas", async () => {
		const rows: SearchRow[] = [
			{ id: "u1", email: null, nrOrdem: null },
			{ id: "u2", email: "a@fab.mil.br", nrOrdem: "123" },
		]

		const result = await searchUsersByEmail(createSearchStub(rows) as never, "a@fab")

		expect(result).toEqual([
			{ id: "u1", email: "", nrOrdem: null },
			{ id: "u2", email: "a@fab.mil.br", nrOrdem: "123" },
		])
	})

	test("escapa metacaracteres do LIKE no termo de busca", async () => {
		const captured: { pattern?: string } = {}

		await searchUsersByEmail(createSearchStub([], captured) as never, "50%_a\\b")

		expect(captured.pattern).toBe("%50\\%\\_a\\\\b%")
	})
})
