import { describe, expect, test } from "bun:test"
import { PermissionDeniedError } from "./errors.ts"
import { requireAnyPermission, requirePermission } from "./guards.ts"
import type { UserContext, UserPermission } from "./types.ts"

function permission(overrides: Partial<UserPermission> = {}): UserPermission {
	return { module: "rumaer", level: 2, mess_hall_id: null, kitchen_id: null, unit_id: null, ...overrides }
}

function ctx(permissions: UserPermission[]): UserContext {
	return { userId: "u1", permissions }
}

describe("requirePermission", () => {
	test("passa quando o grant rumaer global concede o nível pedido", () => {
		expect(() => requirePermission(ctx([permission({ level: 2 })]), "rumaer", 2)).not.toThrow()
	})

	test("nível de administração (3) também satisfaz o gate de edição (2)", () => {
		expect(() => requirePermission(ctx([permission({ level: 3 })]), "rumaer", 2)).not.toThrow()
	})

	test("lança PermissionDeniedError quando falta o módulo", () => {
		expect(() => requirePermission(ctx([permission({ module: "diner", level: 1 })]), "rumaer", 2)).toThrow(PermissionDeniedError)
	})

	test("lança quando o nível é insuficiente (edição não gerencia grants)", () => {
		try {
			requirePermission(ctx([permission({ level: 2 })]), "rumaer", 3)
			throw new Error("deveria ter lançado")
		} catch (e) {
			expect(e).toBeInstanceOf(PermissionDeniedError)
			expect((e as PermissionDeniedError).code).toBe("PERMISSION_DENIED")
		}
	})
})

describe("requireAnyPermission", () => {
	test("passa se QUALQUER módulo conceder o nível", () => {
		expect(() => requireAnyPermission(ctx([permission({ module: "global", level: 2 })]), ["rumaer", "global"], 2)).not.toThrow()
	})

	test("lança quando nenhum módulo concede", () => {
		expect(() => requireAnyPermission(ctx([permission({ module: "diner", level: 1 })]), ["rumaer", "global"], 2)).toThrow(PermissionDeniedError)
	})
})
