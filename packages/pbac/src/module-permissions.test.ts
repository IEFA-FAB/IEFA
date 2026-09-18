import { describe, expect, test } from "bun:test"
import {
	grantModulePermission,
	grantUnscopedModulePermission,
	myModulePermissionsQueryConfig,
	resolveModulePermissions,
	revokeModulePermission,
	searchUsersByEmail,
} from "./module-permissions.ts"
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
						gt(column: string, value: unknown) {
							filters.push(["gt", column, value])
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

		const result = await grantUnscopedModulePermission(stub as never, { module: "sucont-4", userId: "u1", level: 2 })

		expect(result).toEqual({ ok: true })
		expect(calls.inserts).toHaveLength(0)
		expect(calls.updates[0]?.filters).toEqual([
			["eq", "user_id", "u1"],
			["eq", "module", "sucont-4"],
			["is", "mess_hall_id", null],
			["is", "kitchen_id", null],
			["is", "unit_id", null],
			// O filtro que protege o deny: conceder atualiza o ALLOW, nunca a negação.
			["gt", "level", 0],
		])
	})

	test("com DENY na chave e nenhum allow, insere o allow ao lado em vez de sobrescrever a negação", async () => {
		// O update filtra `level > 0`, então a linha de deny não casa: `data` vem vazio.
		const { stub, calls } = createGrantStub({ updateResults: [{ data: [], error: null }] })

		const result = await grantUnscopedModulePermission(stub as never, { module: "rumaer", userId: "u1", level: 2 })

		expect(result).toEqual({ ok: true })
		// Nenhum update efetivo, e o insert cria o allow — o deny continua de pé (índices
		// parciais deixam os dois coexistir) e segue vencendo na resolução até ser revogado.
		expect(calls.inserts).toEqual([{ user_id: "u1", module: "rumaer", level: 2, mess_hall_id: null, kitchen_id: null, unit_id: null }])
		expect(calls.updates[0]?.filters).toContainEqual(["gt", "level", 0])
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

		await expect(grantUnscopedModulePermission(stub as never, { module: "sucont-4", userId: "u1", level: 1 })).rejects.toThrow("boom")
	})
})

// ---------------------------------------------------------------------------
// grantModulePermission (escopo de unidade)
// ---------------------------------------------------------------------------

describe("grantModulePermission", () => {
	test("grant escopado casa a unidade por IGUALDADE e insere com o unit_id", async () => {
		const { stub, calls } = createGrantStub({ updateResults: [{ data: [], error: null }] })

		const result = await grantModulePermission(stub as never, { module: "alpha-aci", userId: "u1", level: 1, unitId: 26 })

		expect(result).toEqual({ ok: true })
		expect(calls.updates[0]?.filters).toEqual([
			["eq", "user_id", "u1"],
			["eq", "module", "alpha-aci"],
			["is", "mess_hall_id", null],
			["is", "kitchen_id", null],
			// `is(unit_id, null)` aqui atualizaria o grant GLOBAL do usuário em vez do da OM.
			["eq", "unit_id", 26],
			["gt", "level", 0],
		])
		expect(calls.inserts).toEqual([{ user_id: "u1", module: "alpha-aci", level: 1, mess_hall_id: null, kitchen_id: null, unit_id: 26 }])
	})

	test("unitId nulo é o grant global — mesmos filtros do atalho unscoped", async () => {
		const scoped = createGrantStub({ updateResults: [{ data: [{ id: "p1" }], error: null }] })
		const unscoped = createGrantStub({ updateResults: [{ data: [{ id: "p1" }], error: null }] })

		await grantModulePermission(scoped.stub as never, { module: "alpha-admin", userId: "u1", level: 3, unitId: null })
		await grantUnscopedModulePermission(unscoped.stub as never, { module: "alpha-admin", userId: "u1", level: 3 })

		expect(scoped.calls.updates[0]?.filters).toEqual(unscoped.calls.updates[0]?.filters ?? [])
		expect(scoped.calls.updates[0]?.filters).toContainEqual(["is", "unit_id", null])
	})

	test("corrida 23505 no grant escopado reaplica como update na MESMA unidade", async () => {
		const { stub, calls } = createGrantStub({
			updateResults: [
				{ data: [], error: null },
				{ data: [{ id: "p1" }], error: null },
			],
			insertError: { message: "duplicate key", code: "23505" },
		})

		await grantModulePermission(stub as never, { module: "alpha-requester", userId: "u1", level: 1, unitId: 7 })

		expect(calls.updates).toHaveLength(2)
		expect(calls.updates[1]?.filters).toContainEqual(["eq", "unit_id", 7])
	})
})

// ---------------------------------------------------------------------------
// revokeModulePermission
// ---------------------------------------------------------------------------

function createRevokeStub(result: { data: Array<{ id: string }> | null; error: { message: string } | null }) {
	const filters: Array<[string, string, unknown]> = []
	const stub = {
		from(table: string) {
			expect(table).toBe("user_permissions")
			return {
				delete() {
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
							return result
						},
					}
					return builder
				},
			}
		},
	}
	return { stub, filters }
}

describe("revokeModulePermission", () => {
	test("revoga só a chave pedida — a OM por igualdade, nunca as outras do usuário", async () => {
		const { stub, filters } = createRevokeStub({ data: [{ id: "p1" }], error: null })

		const result = await revokeModulePermission(stub as never, { module: "alpha-procurement", userId: "u1", unitId: 26 })

		expect(result).toEqual({ removed: 1 })
		expect(filters).toEqual([
			["eq", "user_id", "u1"],
			["eq", "module", "alpha-procurement"],
			["is", "mess_hall_id", null],
			["is", "kitchen_id", null],
			["eq", "unit_id", 26],
		])
	})

	test("global casa `unit_id is null`, e zero linhas volta como zero (não como sucesso inventado)", async () => {
		const { stub, filters } = createRevokeStub({ data: [], error: null })

		const result = await revokeModulePermission(stub as never, { module: "alpha-admin", userId: "u1", unitId: null })

		expect(result).toEqual({ removed: 0 })
		expect(filters).toContainEqual(["is", "unit_id", null])
	})

	test("propaga o erro do delete", async () => {
		const { stub } = createRevokeStub({ data: null, error: { message: "boom" } })

		await expect(revokeModulePermission(stub as never, { module: "alpha-aci", userId: "u1", unitId: 1 })).rejects.toThrow("boom")
	})
})
