import { describe, expect, test } from "bun:test"
import { resolveModuleScopes } from "./module-scopes.ts"
import type { AppModule, UserPermission } from "./types.ts"

function grant(module: AppModule, level: number, scope: Partial<UserPermission> = {}): UserPermission {
	return { module, level, mess_hall_id: null, kitchen_id: null, unit_id: null, ...scope }
}

describe("resolveModuleScopes", () => {
	test("sem minLevel, qualquer allow conta (comportamento dos seletores do sisub)", () => {
		const scopes = resolveModuleScopes([grant("unit", 1, { unit_id: 3 }), grant("unit", 2, { unit_id: 4 })], "unit", "unit")

		expect(scopes.isGlobal).toBe(false)
		expect([...scopes.ids].sort()).toEqual([3, 4])
	})

	test("minLevel descarta o escopo com nível abaixo — alpha-admin 1 não administra OM nenhuma", () => {
		const permissions = [grant("alpha-admin", 1, { unit_id: 3 }), grant("alpha-admin", 3, { unit_id: 4 })]

		expect([...resolveModuleScopes(permissions, "alpha-admin", "unit", 3).ids]).toEqual([4])
	})

	test("minLevel também vale para o global: allow sem escopo de nível baixo não vira global", () => {
		expect(resolveModuleScopes([grant("alpha-admin", 2)], "alpha-admin", "unit", 3).isGlobal).toBe(false)
		expect(resolveModuleScopes([grant("alpha-admin", 3)], "alpha-admin", "unit", 3).isGlobal).toBe(true)
	})

	test("deny escopado tira o id; deny sem escopo derruba tudo", () => {
		const scoped = resolveModuleScopes([grant("alpha-aci", 1, { unit_id: 3 }), grant("alpha-aci", 0, { unit_id: 3 })], "alpha-aci", "unit")
		expect(scoped.ids.size).toBe(0)

		const unscopedDeny = resolveModuleScopes([grant("alpha-aci", 1), grant("alpha-aci", 1, { unit_id: 4 }), grant("alpha-aci", 0)], "alpha-aci", "unit")
		expect(unscopedDeny).toEqual({ isGlobal: false, ids: new Set() })
	})
})
