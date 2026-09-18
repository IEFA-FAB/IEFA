import { describe, expect, test } from "bun:test"
import type { UnitOption } from "@iefa/alpha-client/access"
import { GrantNotAllowedError } from "@iefa/pbac"
import { adminUnitChoices, buildAlphaPermissionChange, canChangeOwnAccess, canListGrants } from "./admin-access"

const ADMIN = "00000000-0000-0000-0000-00000000000a"
const OTHER = "00000000-0000-0000-0000-00000000000b"
// GAP-SJ (26) apoia IAE (100): a cobertura do admin do GAP-SJ já vem expandida.
const SCOPED = { actorId: ADMIN, coverage: [26, 100] as number[] }
const GLOBAL = { actorId: ADMIN, coverage: "all" as const }

function refusal(fn: () => unknown): string | null {
	try {
		fn()
		return null
	} catch (error) {
		if (error instanceof GrantNotAllowedError) return error.reason
		throw error
	}
}

describe("buildAlphaPermissionChange", () => {
	test("grant: módulo e nível saem do papel; sem prazo; ator é o do guard", () => {
		expect(buildAlphaPermissionChange(SCOPED, { userId: OTHER, role: "admin", unitId: 100 })).toEqual({
			actorId: ADMIN,
			app: "contrate",
			action: "grant",
			targetUserId: OTHER,
			module: "alpha-admin",
			level: 3,
			unitId: 100,
			expiresAt: null,
		})
		expect(buildAlphaPermissionChange(SCOPED, { userId: OTHER, role: "procurement", unitId: 26 })).toMatchObject({ module: "alpha-procurement", level: 1 })
	})

	test("revoke: a chave (usuário, módulo, OM), sem nível", () => {
		expect(buildAlphaPermissionChange(SCOPED, { userId: OTHER, module: "alpha-aci", unitId: 26 })).toEqual({
			actorId: ADMIN,
			app: "contrate",
			action: "revoke",
			targetUserId: OTHER,
			module: "alpha-aci",
			unitId: 26,
		})
	})

	// O ator nunca vem do input: mesmo que o objeto carregue um `actorId` (o validator o
	// descartaria), a alteração sai com o do guard.
	test("um actorId no input não substitui o do guard", () => {
		const forged = { userId: OTHER, role: "aci", unitId: 26, actorId: OTHER } as never
		expect(buildAlphaPermissionChange(SCOPED, forged).actorId).toBe(ADMIN)
	})

	test("admin de OM: fora da cobertura e global são recusados", () => {
		expect(refusal(() => buildAlphaPermissionChange(SCOPED, { userId: OTHER, role: "aci", unitId: 10 }))).toBe("OUTSIDE_COVERAGE")
		expect(refusal(() => buildAlphaPermissionChange(SCOPED, { userId: OTHER, role: "aci", unitId: null }))).toBe("GLOBAL_REQUIRES_GLOBAL_ADMIN")
	})

	test("sobre si mesmo: o global pode (grant e revoke de outros papéis); o de OM não", () => {
		expect(refusal(() => buildAlphaPermissionChange(GLOBAL, { userId: ADMIN, role: "aci", unitId: null }))).toBeNull()
		expect(refusal(() => buildAlphaPermissionChange(GLOBAL, { userId: ADMIN, role: "admin", unitId: 26 }))).toBeNull()
		expect(refusal(() => buildAlphaPermissionChange(GLOBAL, { userId: ADMIN, module: "alpha-aci", unitId: 26 }))).toBeNull()
		expect(refusal(() => buildAlphaPermissionChange(SCOPED, { userId: ADMIN, role: "aci", unitId: 26 }))).toBe("SELF_REQUIRES_GLOBAL_ADMIN")
	})

	test("ninguém revoga o próprio alpha-admin — nem o global", () => {
		expect(refusal(() => buildAlphaPermissionChange(GLOBAL, { userId: ADMIN, module: "alpha-admin", unitId: null }))).toBe("SELF_LOCKOUT")
		expect(refusal(() => buildAlphaPermissionChange(GLOBAL, { userId: ADMIN, module: "alpha-admin", unitId: 26 }))).toBe("SELF_LOCKOUT")
		// O de outra pessoa, sim.
		expect(refusal(() => buildAlphaPermissionChange(GLOBAL, { userId: OTHER, module: "alpha-admin", unitId: null }))).toBeNull()
	})
})

describe("canChangeOwnAccess (a tela)", () => {
	test("espelha a regra do servidor", () => {
		expect(canChangeOwnAccess(true, { action: "grant" })).toBe(true)
		expect(canChangeOwnAccess(true, { action: "revoke", module: "alpha-aci" })).toBe(true)
		expect(canChangeOwnAccess(true, { action: "revoke", module: "alpha-admin" })).toBe(false)
		expect(canChangeOwnAccess(false, { action: "grant" })).toBe(false)
	})
})

describe("adminUnitChoices", () => {
	const units: UnitOption[] = [
		{ id: 10, code: "GAP-RJ", display_name: null, supporting_unit_id: null },
		{ id: 26, code: "GAP-SJ", display_name: null, supporting_unit_id: null },
		{ id: 100, code: "IAE", display_name: null, supporting_unit_id: 26 },
	]

	test("global: todas as OMs e o Global", () => {
		expect(adminUnitChoices("all", units)).toEqual({ allowGlobal: true, units })
	})

	test("de OM: só a cobertura, sem Global", () => {
		const choices = adminUnitChoices([26, 100], units)
		expect(choices.allowGlobal).toBe(false)
		expect(choices.units.map((unit) => unit.code)).toEqual(["GAP-SJ", "IAE"])
	})
})

describe("canListGrants", () => {
	test("OM da cobertura sim; outra OM não; `todas` só o global", () => {
		expect(canListGrants([26, 100], 100)).toBe(true)
		expect(canListGrants([26, 100], 10)).toBe(false)
		expect(canListGrants([26, 100], null)).toBe(false)
		expect(canListGrants("all", null)).toBe(true)
	})
})
