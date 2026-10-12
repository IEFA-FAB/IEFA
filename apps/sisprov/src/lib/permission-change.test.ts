import { describe, expect, test } from "bun:test"
import { GrantNotAllowedError } from "@iefa/pbac"
import { buildSisprovGrant, buildSisprovRevoke, isSelfAdminRevoke, type SisprovPermissionRow } from "./permission-change"

const ADMIN = "00000000-0000-4000-8000-00000000000a"
const OTHER = "00000000-0000-4000-8000-00000000000b"
const GAP_SJ = 26
const IAE = 31
const GAP_SP = 40

const GLOBAL = { actorId: ADMIN, coverage: "all" as const }
const SCOPED = { actorId: ADMIN, coverage: [GAP_SJ, IAE] as const }

function refusal(fn: () => unknown): string | null {
	try {
		fn()
		return null
	} catch (error) {
		if (error instanceof GrantNotAllowedError) return error.reason
		throw error
	}
}

const row = (over: Partial<SisprovPermissionRow> = {}): SisprovPermissionRow => ({
	id: "p1",
	user_id: OTHER,
	module: "sisprov-supply",
	level: 2,
	unit_id: IAE,
	kitchen_id: null,
	mess_hall_id: null,
	...over,
})

describe("buildSisprovGrant", () => {
	test("o ator é o da sessão; módulo, nível e OM saem do pedido validado", () => {
		expect(buildSisprovGrant(GLOBAL, { userId: OTHER, module: "sisprov-supply", level: 2, unitId: IAE })).toEqual({
			actorId: ADMIN,
			app: "sisprov",
			action: "grant",
			targetUserId: OTHER,
			module: "sisprov-supply",
			level: 2,
			unitId: IAE,
			expiresAt: null,
		})
	})

	test("administrador global concede a si mesmo, mas não se rebaixa", () => {
		expect(refusal(() => buildSisprovGrant(GLOBAL, { userId: ADMIN, module: "sisprov-admin", level: 3, unitId: null }))).toBeNull()
		expect(refusal(() => buildSisprovGrant(GLOBAL, { userId: ADMIN, module: "sisprov-admin", level: 2, unitId: null }))).toBe("SELF_LOCKOUT")
		expect(refusal(() => buildSisprovGrant(GLOBAL, { userId: ADMIN, module: "sisprov-planning", level: 2, unitId: GAP_SJ }))).toBeNull()
	})

	test("administrador escopado concede só na cobertura dele, nunca global nem a si mesmo", () => {
		expect(refusal(() => buildSisprovGrant(SCOPED, { userId: OTHER, module: "sisprov-supply", level: 2, unitId: IAE }))).toBeNull()
		expect(refusal(() => buildSisprovGrant(SCOPED, { userId: OTHER, module: "sisprov-supply", level: 2, unitId: GAP_SP }))).toBe("OUTSIDE_COVERAGE")
		expect(refusal(() => buildSisprovGrant(SCOPED, { userId: OTHER, module: "sisprov-supply", level: 2, unitId: null }))).toBe("GLOBAL_REQUIRES_GLOBAL_ADMIN")
		expect(refusal(() => buildSisprovGrant(SCOPED, { userId: ADMIN, module: "sisprov-supply", level: 1, unitId: IAE }))).toBe("SELF_REQUIRES_GLOBAL_ADMIN")
	})
})

describe("buildSisprovRevoke", () => {
	test("o alvo, o escopo e a partição saem da LINHA, não do cliente", () => {
		expect(buildSisprovRevoke(GLOBAL, row())).toMatchObject({
			action: "revoke",
			targetUserId: OTHER,
			module: "sisprov-supply",
			unitId: IAE,
			partition: "allow",
		})
		expect(buildSisprovRevoke(GLOBAL, row({ level: 0 }))).toMatchObject({ partition: "deny" })
	})

	test("ninguém revoga a própria administração; o próprio nível 2 ou um bloqueio podem sair", () => {
		expect(refusal(() => buildSisprovRevoke(GLOBAL, row({ user_id: ADMIN, module: "sisprov-admin", level: 3, unit_id: null })))).toBe("SELF_LOCKOUT")
		expect(refusal(() => buildSisprovRevoke(GLOBAL, row({ user_id: ADMIN, module: "sisprov-admin", level: 2, unit_id: null })))).toBeNull()
		expect(refusal(() => buildSisprovRevoke(GLOBAL, row({ user_id: ADMIN, module: "sisprov-admin", level: 0, unit_id: null })))).toBeNull()
	})

	test("linha de outro app do ERP não é revogável por aqui", () => {
		expect(() => buildSisprovRevoke(GLOBAL, row({ module: "storage" }))).toThrow("não é um acesso do SISPROV")
	})

	test("isSelfAdminRevoke só reconhece o próprio allow de administração", () => {
		expect(isSelfAdminRevoke(ADMIN, { user_id: ADMIN, module: "sisprov-admin", level: 3 })).toBe(true)
		expect(isSelfAdminRevoke(ADMIN, { user_id: ADMIN, module: "sisprov-admin", level: 2 })).toBe(false)
		expect(isSelfAdminRevoke(ADMIN, { user_id: OTHER, module: "sisprov-admin", level: 3 })).toBe(false)
	})
})
