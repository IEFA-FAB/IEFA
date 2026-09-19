import { describe, expect, test } from "bun:test"
import type { UnitOption } from "@iefa/alpha-client/access"
import { GrantNotAllowedError, type UnitSupportEdge, type UserPermission } from "@iefa/pbac"
import {
	adminUnitChoices,
	annotateDenyImpact,
	buildAlphaPermissionChange,
	canChangeOwnAccess,
	canListGrants,
	denyImpactNeedsGraph,
	denyImpactOnAllow,
	type GrantRowLike,
	grantRowKey,
	initialGrantUnit,
	RevokeAlphaRoleSchema,
	splitGrantsByEffect,
	supportingUnitsOf,
} from "./admin-access"

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

	test("revoke: a chave (usuário, módulo, OM) e o lado, sem nível", () => {
		expect(buildAlphaPermissionChange(SCOPED, { userId: OTHER, module: "alpha-aci", unitId: 26, effect: "allow" })).toEqual({
			actorId: ADMIN,
			app: "contrate",
			action: "revoke",
			targetUserId: OTHER,
			module: "alpha-aci",
			unitId: 26,
			partition: "allow",
		})
	})

	// Retirar bloqueio é só do global: o escopado o vê, mas o servidor recusa, mesmo na própria OM.
	test("retirar bloqueio: só o global; o de OM é recusado dentro da cobertura", () => {
		expect(buildAlphaPermissionChange(GLOBAL, { userId: OTHER, module: "alpha-aci", unitId: 26, effect: "deny" })).toMatchObject({
			action: "revoke",
			partition: "deny",
		})
		expect(refusal(() => buildAlphaPermissionChange(SCOPED, { userId: OTHER, module: "alpha-aci", unitId: 26, effect: "deny" }))).toBe(
			"DENY_REQUIRES_GLOBAL_ADMIN"
		)
		expect(refusal(() => buildAlphaPermissionChange(SCOPED, { userId: OTHER, module: "alpha-admin", unitId: 100, effect: "deny" }))).toBe(
			"DENY_REQUIRES_GLOBAL_ADMIN"
		)
		// O acesso da mesma chave segue revogável pelo escopado.
		expect(refusal(() => buildAlphaPermissionChange(SCOPED, { userId: OTHER, module: "alpha-aci", unitId: 26, effect: "allow" }))).toBeNull()
	})

	test("o validator exige o lado da revogação — sem ele não há revoke da chave inteira por aqui", () => {
		const base = { userId: "00000000-0000-4000-8000-00000000000b", module: "alpha-aci", unitId: 26 }
		expect(RevokeAlphaRoleSchema.safeParse(base).success).toBe(false)
		expect(RevokeAlphaRoleSchema.safeParse({ ...base, effect: "all" }).success).toBe(false)
		expect(RevokeAlphaRoleSchema.safeParse({ ...base, effect: "deny" }).success).toBe(true)
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
		expect(refusal(() => buildAlphaPermissionChange(GLOBAL, { userId: ADMIN, module: "alpha-aci", unitId: 26, effect: "allow" }))).toBeNull()
		expect(refusal(() => buildAlphaPermissionChange(SCOPED, { userId: ADMIN, role: "aci", unitId: 26 }))).toBe("SELF_REQUIRES_GLOBAL_ADMIN")
	})

	test("ninguém revoga o próprio alpha-admin — nem o global", () => {
		expect(refusal(() => buildAlphaPermissionChange(GLOBAL, { userId: ADMIN, module: "alpha-admin", unitId: null, effect: "allow" }))).toBe("SELF_LOCKOUT")
		expect(refusal(() => buildAlphaPermissionChange(GLOBAL, { userId: ADMIN, module: "alpha-admin", unitId: 26, effect: "allow" }))).toBe("SELF_LOCKOUT")
		// O de outra pessoa, sim.
		expect(refusal(() => buildAlphaPermissionChange(GLOBAL, { userId: OTHER, module: "alpha-admin", unitId: null, effect: "allow" }))).toBeNull()
		// Retirar o próprio BLOQUEIO de administração não tranca ninguém para fora.
		expect(refusal(() => buildAlphaPermissionChange(GLOBAL, { userId: ADMIN, module: "alpha-admin", unitId: 26, effect: "deny" }))).toBeNull()
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

describe("lista: acesso e bloqueio", () => {
	const row = (over: Partial<GrantRowLike>): GrantRowLike => ({
		source: "inline",
		effect: "allow",
		userId: OTHER,
		module: "alpha-aci",
		unitId: 26,
		level: 1,
		expiresAt: null,
		...over,
	})

	// Os dois lados da MESMA chave do banco são duas linhas na tela — chaves de React distintas.
	test("grantRowKey separa acesso e bloqueio da mesma chave", () => {
		expect(grantRowKey(row({ effect: "allow" }))).not.toBe(grantRowKey(row({ effect: "deny" })))
		expect(grantRowKey(row({ unitId: null }))).not.toBe(grantRowKey(row({ unitId: 26 })))
	})

	test("splitGrantsByEffect: bloqueio nunca cai na lista de acessos", () => {
		const allow = row({})
		const deny = row({ effect: "deny" })
		expect(splitGrantsByEffect([allow, deny])).toEqual({ allows: [allow], denies: [deny] })
	})
})

// Hierarquia de apoio: GAP-SJ (26) apoia IAE (100) e DCTA (101); 7 não apoia nem é apoiada.
const GRAPH: UnitSupportEdge[] = [
	{ id: 7, supporting_unit_id: null },
	{ id: 26, supporting_unit_id: null },
	{ id: 100, supporting_unit_id: 26 },
	{ id: 101, supporting_unit_id: 26 },
]

const deny = (over: Partial<UserPermission> = {}): UserPermission => ({
	module: "alpha-aci",
	level: 0,
	unit_id: null,
	kitchen_id: null,
	mess_hall_id: null,
	...over,
})

describe("denyImpactOnAllow (a mesma conta da API do α)", () => {
	const aciAt = (unitId: number | null) => ({ module: "alpha-aci" as const, level: 1, unitId })

	test("sem bloqueio do papel: vale, e não pede o grafo", () => {
		expect(denyImpactOnAllow(aciAt(100), [deny({ module: "alpha-admin" })], null)).toBe("none")
		expect(denyImpactNeedsGraph(aciAt(100), [deny({ module: "alpha-admin" })])).toBe(false)
	})

	test("bloqueio sem OM derruba o papel em todo lugar", () => {
		expect(denyImpactOnAllow(aciAt(100), [deny()], GRAPH)).toBe("full")
		expect(denyImpactOnAllow(aciAt(null), [deny()], GRAPH)).toBe("full")
		// Global contra global: nem o grafo é preciso.
		expect(denyImpactNeedsGraph(aciAt(null), [deny()])).toBe(false)
		expect(denyImpactOnAllow(aciAt(null), [deny()], null)).toBe("full")
	})

	test("bloqueio na mesma OM anula", () => {
		expect(denyImpactOnAllow(aciAt(100), [deny({ unit_id: 100 })], GRAPH)).toBe("full")
	})

	test("bloqueio na OM APOIADORA anula o acesso na apoiada", () => {
		expect(denyImpactNeedsGraph(aciAt(100), [deny({ unit_id: 26 })])).toBe(true)
		expect(denyImpactOnAllow(aciAt(100), [deny({ unit_id: 26 })], GRAPH)).toBe("full")
	})

	test("bloqueio na OM APOIADA não anula o acesso na apoiadora", () => {
		expect(denyImpactOnAllow(aciAt(26), [deny({ unit_id: 100 })], GRAPH)).toBe("none")
	})

	test("bloqueio em OM sem relação não anula", () => {
		expect(denyImpactOnAllow(aciAt(100), [deny({ unit_id: 7 })], GRAPH)).toBe("none")
	})

	test("acesso global com bloqueio escopado: vale, menos nas OMs bloqueadas", () => {
		expect(denyImpactOnAllow(aciAt(null), [deny({ unit_id: 26 })], GRAPH)).toBe("partial")
	})

	test("o bloqueio de outro papel não conta", () => {
		expect(denyImpactOnAllow(aciAt(100), [deny({ module: "alpha-procurement", unit_id: 26 })], GRAPH)).toBe("none")
	})

	test("o administrador conta no nível dele", () => {
		const admin = { module: "alpha-admin" as const, level: 3, unitId: 100 }
		expect(denyImpactOnAllow(admin, [deny({ module: "alpha-admin", unit_id: 26 })], GRAPH)).toBe("full")
		expect(denyImpactOnAllow(admin, [deny({ module: "alpha-admin", unit_id: 101 })], GRAPH)).toBe("none")
	})

	test("conferir um bloqueio como se fosse acesso é erro de programação", () => {
		expect(() => denyImpactOnAllow({ module: "alpha-aci", level: 0, unitId: 26 }, [], GRAPH)).toThrow()
	})
})

describe("annotateDenyImpact (o selo da lista)", () => {
	const now = Date.parse("2026-09-18T12:00:00Z")
	const row = (over: Partial<GrantRowLike>): GrantRowLike => ({
		source: "inline",
		effect: "allow",
		userId: OTHER,
		module: "alpha-aci",
		unitId: 100,
		level: 1,
		expiresAt: null,
		...over,
	})
	const impactOf = (grants: GrantRowLike[]) => annotateDenyImpact(grants, GRAPH, now).map((g) => g.denyImpact)

	test("bloqueio sem OM anula o acesso da OM", () => {
		expect(impactOf([row({}), row({ effect: "deny", level: 0, unitId: null })])).toEqual(["full", "none"])
	})

	test("bloqueio na apoiadora anula o acesso na apoiada", () => {
		expect(impactOf([row({}), row({ effect: "deny", level: 0, unitId: 26 })])).toEqual(["full", "none"])
	})

	test("bloqueio na apoiada não anula o acesso na apoiadora", () => {
		expect(impactOf([row({ unitId: 26 }), row({ effect: "deny", level: 0, unitId: 100 })])).toEqual(["none", "none"])
	})

	test("bloqueio emprestado por política anula como o inline", () => {
		expect(impactOf([row({}), row({ source: "policy", policyName: "Suspensão", effect: "deny", level: 0, unitId: 26 })])).toEqual(["full", "none"])
	})

	test("bloqueio vencido não anula; com prazo no futuro, anula", () => {
		expect(impactOf([row({}), row({ effect: "deny", level: 0, unitId: null, expiresAt: "2026-09-17T00:00:00Z" })])).toEqual(["none", "none"])
		expect(impactOf([row({}), row({ effect: "deny", level: 0, unitId: null, expiresAt: "2026-09-19T00:00:00Z" })])).toEqual(["full", "none"])
	})

	test("bloqueio de outra pessoa ou de outro papel não anula", () => {
		expect(impactOf([row({}), row({ effect: "deny", level: 0, unitId: null, userId: ADMIN })])).toEqual(["none", "none"])
		expect(impactOf([row({}), row({ effect: "deny", level: 0, unitId: null, module: "alpha-admin" })])).toEqual(["none", "none"])
	})

	test("acesso global recortado por bloqueio numa OM é parcial", () => {
		expect(impactOf([row({ unitId: null }), row({ effect: "deny", level: 0, unitId: 7 })])).toEqual(["partial", "none"])
	})

	test("acesso vencido não leva o selo — já tem o dele", () => {
		expect(impactOf([row({ expiresAt: "2026-09-17T00:00:00Z" }), row({ effect: "deny", level: 0, unitId: null })])).toEqual(["none", "none"])
	})
})

describe("supportingUnitsOf", () => {
	test("sobe a cadeia de apoio, sem a própria OM", () => {
		expect(supportingUnitsOf(100, GRAPH)).toEqual([26])
		expect(supportingUnitsOf(26, GRAPH)).toEqual([])
		expect(supportingUnitsOf(999, GRAPH)).toEqual([])
	})

	test("transitiva e sem laço", () => {
		const chain: UnitSupportEdge[] = [
			{ id: 1, supporting_unit_id: null },
			{ id: 2, supporting_unit_id: 1 },
			{ id: 3, supporting_unit_id: 2 },
		]
		expect(supportingUnitsOf(3, chain)).toEqual([2, 1])
		const cycle: UnitSupportEdge[] = [
			{ id: 1, supporting_unit_id: 2 },
			{ id: 2, supporting_unit_id: 1 },
		]
		expect(supportingUnitsOf(1, cycle)).toEqual([2])
	})
})

describe("initialGrantUnit (o formulário de concessão)", () => {
	test("parte da OM da página; em todas, de nenhuma", () => {
		expect(initialGrantUnit({ kind: "unit", unitId: 26 })).toBe(26)
		expect(initialGrantUnit({ kind: "unit", unitId: 100 })).toBe(100)
		expect(initialGrantUnit({ kind: "all", unitId: null })).toBeNull()
	})
})
