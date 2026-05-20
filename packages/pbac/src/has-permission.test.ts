import { describe, expect, test } from "bun:test"
import { hasPermission } from "./has-permission.ts"
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
