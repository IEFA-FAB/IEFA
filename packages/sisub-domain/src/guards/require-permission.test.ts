import { describe, expect, test } from "bun:test"
import type { UserContext, UserPermission } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import { requireKitchen, requireMessHall, requirePermission, requireUnit } from "./require-permission.ts"

function ctx(permissions: UserPermission[]): UserContext {
	return {
		userId: "user-1",
		permissions,
	}
}

function permission(overrides: Partial<UserPermission> = {}): UserPermission {
	return {
		module: "kitchen",
		level: 1,
		kitchen_id: null,
		mess_hall_id: null,
		unit_id: null,
		...overrides,
	}
}

describe("requirePermission", () => {
	test("não lança quando permissão global atende ao nível mínimo", () => {
		const user = ctx([permission({ module: "analytics", level: 2 })])

		expect(() => requirePermission(user, "analytics", 1)).not.toThrow()
	})

	test("lança PermissionDeniedError quando não há permissão do módulo", () => {
		const user = ctx([permission({ module: "diner", level: 1 })])

		expect(() => requirePermission(user, "analytics", 1)).toThrow(PermissionDeniedError)
	})

	test("lança PermissionDeniedError quando nível é insuficiente", () => {
		const user = ctx([permission({ module: "unit", level: 1, unit_id: 10 })])

		expect(() => requirePermission(user, "unit", 2, { type: "unit", id: 10 })).toThrow("Requires unit level 2 (unit:10)")
	})

	test("lança PermissionDeniedError quando escopo diverge", () => {
		const user = ctx([permission({ module: "kitchen", level: 2, kitchen_id: 1 })])

		expect(() => requirePermission(user, "kitchen", 2, { type: "kitchen", id: 2 })).toThrow(PermissionDeniedError)
	})
})

describe("scope helpers", () => {
	test("requireKitchen valida permissão de cozinha escopada", () => {
		const user = ctx([permission({ module: "kitchen", level: 2, kitchen_id: 5 })])

		expect(() => requireKitchen(user, 2, 5)).not.toThrow()
		expect(() => requireKitchen(user, 2, 6)).toThrow(PermissionDeniedError)
	})

	test("requireUnit valida permissão de unidade escopada", () => {
		const user = ctx([permission({ module: "unit", level: 1, unit_id: 3 })])

		expect(() => requireUnit(user, 1, 3)).not.toThrow()
		expect(() => requireUnit(user, 1, 4)).toThrow(PermissionDeniedError)
	})

	test("requireMessHall valida permissão de rancho escopada", () => {
		const user = ctx([permission({ module: "messhall", level: 2, mess_hall_id: 9 })])

		expect(() => requireMessHall(user, 2, 9)).not.toThrow()
		expect(() => requireMessHall(user, 2, 10)).toThrow(PermissionDeniedError)
	})
})
