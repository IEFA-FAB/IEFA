import { describe, expect, test } from "bun:test"
import type { UserPermission } from "@iefa/pbac"
import { hasBroadAccess, isAlphaDenied, resolveAlphaAccess } from "./alpha-access.ts"

function grant(module: UserPermission["module"], level: number, scope: Partial<UserPermission> = {}): UserPermission {
	return { module, level, mess_hall_id: null, kitchen_id: null, unit_id: null, ...scope }
}

describe("resolveAlphaAccess", () => {
	test("sem grant é nível 0 — o autenticado segue com chat e o próprio documento", () => {
		expect(resolveAlphaAccess([])).toEqual({ level: 0, canManageAccess: false })
		expect(isAlphaDenied([])).toBe(false)
	})

	test("o nível é o maior grant do módulo alpha", () => {
		expect(resolveAlphaAccess([grant("alpha", 1)]).level).toBe(1)
		expect(resolveAlphaAccess([grant("alpha", 2)]).level).toBe(2)
		expect(resolveAlphaAccess([grant("alpha", 3)]).level).toBe(3)
	})

	test("grant de outro app não vaza para o α", () => {
		expect(resolveAlphaAccess([grant("sucont-admin", 3), grant("admin", 3)])).toEqual({ level: 0, canManageAccess: false })
	})

	test("gerir acessos é alpha-admin 3, e não o nível ACI", () => {
		expect(resolveAlphaAccess([grant("alpha", 3)]).canManageAccess).toBe(false)
		expect(resolveAlphaAccess([grant("alpha-admin", 3)])).toEqual({ level: 0, canManageAccess: true })
		expect(resolveAlphaAccess([grant("alpha-admin", 2)]).canManageAccess).toBe(false)
	})

	test("deny sem escopo vence o allow e fecha a API", () => {
		const permissions = [grant("alpha", 3), grant("alpha", 0)]
		expect(resolveAlphaAccess(permissions).level).toBe(0)
		expect(isAlphaDenied(permissions)).toBe(true)
	})
})

describe("hasBroadAccess", () => {
	test("licitações e ACI enxergam o fluxo inteiro; requisitante e sem perfil, não", () => {
		expect(hasBroadAccess({ level: 3, canManageAccess: false })).toBe(true)
		expect(hasBroadAccess({ level: 2, canManageAccess: false })).toBe(true)
		expect(hasBroadAccess({ level: 1, canManageAccess: false })).toBe(false)
		expect(hasBroadAccess({ level: 0, canManageAccess: true })).toBe(false)
	})
})
