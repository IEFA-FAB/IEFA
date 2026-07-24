import { describe, expect, test } from "bun:test"
import { grantUnscopedModulePermission, myModulePermissionsQueryConfig, resolveModulePermissions, searchUsersByEmail } from "./module-permissions.ts"
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
		from() {
			return {
				select() {
					return {
						eq() {
							return { data: rows, error: null }
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
		const permissions = await resolveModulePermissions("user-1", createResolveStub([]) as never, "sucont")

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

// ---------------------------------------------------------------------------
// grantUnscopedModulePermission
// ---------------------------------------------------------------------------

type GrantStubOptions = {
	updateResults: Array<{ data: Array<{ id: string }> | null; error: { message: string } | null }>
	insertError?: { message: string; code?: string } | null
}

function createGrantStub(options: GrantStubOptions) {
	const calls: { updates: Array<{ level: number; filters: Array<[string, string, unknown]> }>; inserts: Array<Record<string, unknown>> } = {
		updates: [],
		inserts: [],
	}
	const stub = {
		from(table: string) {
			expect(table).toBe("user_permissions")
			return {
				update(payload: { level: number }) {
					const filters: Array<[string, string, unknown]> = []
					calls.updates.push({ level: payload.level, filters })
					const builder = {
						eq(column: string, value: unknown) {
							filters.push(["eq", column, value])
							return builder
						},
						is(column: string, value: unknown) {
							filters.push(["is", column, value])
							return builder
						},
						select() {
							return options.updateResults[calls.updates.length - 1] ?? { data: [], error: null }
						},
					}
					return builder
				},
				insert(payload: Record<string, unknown>) {
					calls.inserts.push(payload)
					return { error: options.insertError ?? null }
				},
			}
		},
	}
	return { stub, calls }
}

describe("grantUnscopedModulePermission", () => {
	test("atualiza o grant unscoped existente sem inserir", async () => {
		const { stub, calls } = createGrantStub({ updateResults: [{ data: [{ id: "p1" }], error: null }] })

		const result = await grantUnscopedModulePermission(stub as never, { module: "sucont", userId: "u1", level: 2 })

		expect(result).toEqual({ ok: true })
		expect(calls.inserts).toHaveLength(0)
		expect(calls.updates[0]?.filters).toEqual([
			["eq", "user_id", "u1"],
			["eq", "module", "sucont"],
			["is", "mess_hall_id", null],
			["is", "kitchen_id", null],
			["is", "unit_id", null],
		])
	})

	test("insere grant global explícito quando não existe", async () => {
		const { stub, calls } = createGrantStub({ updateResults: [{ data: [], error: null }] })

		const result = await grantUnscopedModulePermission(stub as never, { module: "rumaer", userId: "u1", level: 3 })

		expect(result).toEqual({ ok: true })
		expect(calls.inserts).toEqual([{ user_id: "u1", module: "rumaer", level: 3, mess_hall_id: null, kitchen_id: null, unit_id: null }])
	})

	test("corrida 23505 no insert reaplica como update", async () => {
		const { stub, calls } = createGrantStub({
			updateResults: [
				{ data: [], error: null },
				{ data: [{ id: "p1" }], error: null },
			],
			insertError: { message: "duplicate key", code: "23505" },
		})

		const result = await grantUnscopedModulePermission(stub as never, { module: "rumaer", userId: "u1", level: 2 })

		expect(result).toEqual({ ok: true })
		expect(calls.updates).toHaveLength(2)
	})

	test("propaga erro de insert que não é unique_violation", async () => {
		const { stub } = createGrantStub({ updateResults: [{ data: [], error: null }], insertError: { message: "boom", code: "XX000" } })

		await expect(grantUnscopedModulePermission(stub as never, { module: "sucont", userId: "u1", level: 1 })).rejects.toThrow("boom")
	})
})
