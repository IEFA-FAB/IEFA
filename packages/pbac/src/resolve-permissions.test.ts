import { describe, expect, test } from "bun:test"
import { resolveUserPermissions } from "./resolve-permissions.ts"
import type { UserPermission } from "./types.ts"

function createSupabaseStub(rows: UserPermission[], error: { message: string } | null = null) {
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
							return { data: rows, error }
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

	test("remove deny explícito antes de retornar permissões efetivas", async () => {
		const rows: UserPermission[] = [
			{ module: "kitchen", level: 0, kitchen_id: 11, mess_hall_id: null, unit_id: null },
			{ module: "unit", level: 2, unit_id: 3, kitchen_id: null, mess_hall_id: null },
		]

		const permissions = await resolveUserPermissions("user-1", createSupabaseStub(rows) as never)

		expect(permissions.some((permission) => permission.level === 0)).toBe(false)
		expect(permissions).toContainEqual(rows[1])
	})

	test("não injeta diner implícito quando existe regra explícita de diner", async () => {
		const rows: UserPermission[] = [{ module: "diner", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }]

		const permissions = await resolveUserPermissions("user-1", createSupabaseStub(rows) as never)

		expect(permissions).toEqual(rows)
	})

	test("propaga erro de consulta com mensagem sanitizada", async () => {
		const promise = resolveUserPermissions("user-1", createSupabaseStub([], { message: "database unavailable" }) as never)

		await expect(promise).rejects.toThrow("Falha ao buscar permissões: database unavailable")
	})
})
