import { describe, expect, test } from "bun:test"
import { hasAnyPermission, hasPermission } from "./has-permission.ts"
import type { UserPermission } from "./types.ts"

function permission(overrides: Partial<UserPermission> = {}): UserPermission {
	return {
		module: "kitchen",
		level: 1,
		mess_hall_id: null,
		kitchen_id: null,
		unit_id: null,
		...overrides,
	}
}

describe("hasPermission", () => {
	test("permite permissão global para qualquer escopo do módulo", () => {
		const permissions = [permission({ module: "kitchen", level: 2 })]

		expect(hasPermission(permissions, "kitchen", 1, { type: "kitchen", id: 10 })).toBe(true)
		expect(hasPermission(permissions, "kitchen", 2, { type: "kitchen", id: 99 })).toBe(true)
	})

	test("nega quando o módulo é diferente", () => {
		const permissions = [permission({ module: "messhall", level: 3, mess_hall_id: 1 })]

		expect(hasPermission(permissions, "kitchen", 1, { type: "kitchen", id: 1 })).toBe(false)
	})

	test("nega quando o nível é insuficiente", () => {
		const permissions = [permission({ module: "unit", level: 1, unit_id: 7 })]

		expect(hasPermission(permissions, "unit", 2, { type: "unit", id: 7 })).toBe(false)
	})

	test("permite permissão escopada quando o escopo bate", () => {
		const permissions = [permission({ module: "messhall", level: 2, mess_hall_id: 4 })]

		expect(hasPermission(permissions, "messhall", 2, { type: "mess_hall", id: 4 })).toBe(true)
	})

	test("nega permissão escopada quando o escopo diverge", () => {
		const permissions = [permission({ module: "local-analytics", level: 1, unit_id: 3 })]

		expect(hasPermission(permissions, "local-analytics", 1, { type: "unit", id: 9 })).toBe(false)
	})

	test("permite qualquer escopo compatível quando o caller não exige scope", () => {
		const permissions = [permission({ module: "storage", level: 1, unit_id: 3 })]

		expect(hasPermission(permissions, "storage")).toBe(true)
	})
})

describe("hasAnyPermission", () => {
	test("basta um módulo conceder", () => {
		const permissions = [permission({ module: "sucont-3", level: 1 })]

		expect(hasAnyPermission(permissions, ["sucont-3", "sucont-4"], 1)).toBe(true)
	})

	test("nega quando nenhum concede", () => {
		const permissions = [permission({ module: "sucont-1", level: 2 })]

		expect(hasAnyPermission(permissions, ["sucont-3", "sucont-4"], 1)).toBe(false)
	})

	test("o nível é cobrado em cada módulo, não somado entre eles", () => {
		// Dois acessos de leitura não fazem um de escrita: exigir nível 2 com dois
		// grants de nível 1 tem de negar.
		const permissions = [permission({ module: "sucont-3", level: 1 }), permission({ module: "sucont-4", level: 1 })]

		expect(hasAnyPermission(permissions, ["sucont-3", "sucont-4"], 2)).toBe(false)
	})

	test("deny de um módulo NÃO derruba o allow de outro", () => {
		// Negar a SUCONT-4 é negar aquela divisão, não o app: a precedência de deny é
		// por módulo, e propagá-la para a lista trancaria as outras duas junto.
		const permissions = [permission({ module: "sucont-3", level: 1 }), permission({ module: "sucont-4", level: 0 })]

		expect(hasAnyPermission(permissions, ["sucont-3", "sucont-4"], 1)).toBe(true)
		expect(hasPermission(permissions, "sucont-4", 1)).toBe(false)
	})

	test("lista vazia nega — nenhum módulo é 'qualquer módulo'", () => {
		const permissions = [permission({ module: "sucont-3", level: 3 })]

		expect(hasAnyPermission(permissions, [], 1)).toBe(false)
	})
})
