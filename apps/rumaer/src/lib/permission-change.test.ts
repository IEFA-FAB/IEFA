import { describe, expect, test } from "bun:test"
import { GrantNotAllowedError } from "@iefa/pbac"
import { buildRumaerGrant, buildRumaerRevoke, type RumaerPermissionRow } from "./permission-change"

const ADMIN = "00000000-0000-4000-8000-00000000000a"
const OTHER = "00000000-0000-4000-8000-00000000000b"

function refusal(fn: () => unknown): string | null {
	try {
		fn()
		return null
	} catch (error) {
		if (error instanceof GrantNotAllowedError) return error.reason
		throw error
	}
}

const row = (over: Partial<RumaerPermissionRow> = {}): RumaerPermissionRow => ({
	id: "p1",
	user_id: OTHER,
	module: "rumaer",
	level: 2,
	unit_id: null,
	kitchen_id: null,
	mess_hall_id: null,
	...over,
})

describe("buildRumaerGrant", () => {
	test("o ator é o da sessão e o grant é global, sem prazo", () => {
		expect(buildRumaerGrant(ADMIN, { userId: OTHER, level: 2 })).toEqual({
			actorId: ADMIN,
			app: "rumaer",
			action: "grant",
			targetUserId: OTHER,
			module: "rumaer",
			level: 2,
			unitId: null,
			expiresAt: null,
		})
	})

	test("administrador pode conceder a si mesmo — mas não se rebaixar", () => {
		expect(refusal(() => buildRumaerGrant(ADMIN, { userId: ADMIN, level: 3 }))).toBeNull()
		expect(refusal(() => buildRumaerGrant(ADMIN, { userId: ADMIN, level: 2 }))).toBe("SELF_LOCKOUT")
		expect(refusal(() => buildRumaerGrant(ADMIN, { userId: OTHER, level: 2 }))).toBeNull()
	})
})

describe("buildRumaerRevoke", () => {
	test("o alvo e a partição saem da LINHA, não do cliente", () => {
		expect(buildRumaerRevoke(ADMIN, row({ level: 3 }))).toMatchObject({ action: "revoke", targetUserId: OTHER, module: "rumaer", partition: "allow" })
		expect(buildRumaerRevoke(ADMIN, row({ level: 0 }))).toMatchObject({ partition: "deny" })
	})

	test("ninguém revoga a própria administração; o próprio nível 2 (ou um bloqueio) pode sair", () => {
		expect(refusal(() => buildRumaerRevoke(ADMIN, row({ user_id: ADMIN, level: 3 })))).toBe("SELF_LOCKOUT")
		expect(refusal(() => buildRumaerRevoke(ADMIN, row({ user_id: ADMIN, level: 2 })))).toBeNull()
		expect(refusal(() => buildRumaerRevoke(ADMIN, row({ user_id: ADMIN, level: 0 })))).toBeNull()
	})

	test("recusa linha de outro módulo", () => {
		expect(() => buildRumaerRevoke(ADMIN, row({ module: "global" }))).toThrow(/RUMAER/)
	})
})
