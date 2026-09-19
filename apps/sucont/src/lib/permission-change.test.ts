import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { GrantNotAllowedError } from "@iefa/pbac"
import { buildSucontGrant, buildSucontRevoke, isSelfAdminRevoke, type SucontPermissionRow } from "./permission-change"

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

describe("buildSucontGrant", () => {
	test("grant global, sem prazo, com o ator da sessão", () => {
		expect(buildSucontGrant(ADMIN, { userId: OTHER, module: "sucont-3", level: 2 })).toEqual({
			actorId: ADMIN,
			app: "sucont",
			action: "grant",
			targetUserId: OTHER,
			module: "sucont-3",
			level: 2,
			unitId: null,
			expiresAt: null,
		})
	})

	test("o administrador (global do app) pode conceder a si mesmo", () => {
		expect(refusal(() => buildSucontGrant(ADMIN, { userId: ADMIN, module: "sucont-1", level: 1 }))).toBeNull()
	})
})

const row = (over: Partial<SucontPermissionRow> = {}): SucontPermissionRow => ({
	id: "perm-1",
	user_id: OTHER,
	module: "sucont-4",
	level: 1,
	unit_id: null,
	kitchen_id: null,
	mess_hall_id: null,
	...over,
})

describe("buildSucontRevoke", () => {
	test("revoga a chave e o lado da LINHA mostrada — alvo, módulo e escopo saem da linha", () => {
		expect(buildSucontRevoke(ADMIN, row())).toEqual({
			actorId: ADMIN,
			app: "sucont",
			action: "revoke",
			targetUserId: OTHER,
			module: "sucont-4",
			unitId: null,
			kitchenId: null,
			messHallId: null,
			partition: "allow",
		})
	})

	test("linha ESCOPADA revoga a chave escopada (a global não é tocada)", () => {
		expect(buildSucontRevoke(ADMIN, row({ unit_id: 12 }))).toMatchObject({ unitId: 12, kitchenId: null, messHallId: null, partition: "allow" })
		expect(buildSucontRevoke(ADMIN, row({ kitchen_id: 3 }))).toMatchObject({ unitId: null, kitchenId: 3 })
	})

	test("linha de bloqueio revoga só o deny da chave", () => {
		expect(buildSucontRevoke(ADMIN, row({ level: 0 }))).toMatchObject({ partition: "deny" })
	})

	test("ninguém revoga a própria administração; a própria divisão (ou o próprio bloqueio) pode sair", () => {
		expect(refusal(() => buildSucontRevoke(ADMIN, row({ user_id: ADMIN, module: "sucont-admin", level: 3 })))).toBe("SELF_LOCKOUT")
		expect(refusal(() => buildSucontRevoke(ADMIN, row({ user_id: ADMIN, module: "sucont-3" })))).toBeNull()
		expect(refusal(() => buildSucontRevoke(ADMIN, row({ user_id: ADMIN, module: "sucont-admin", level: 0 })))).toBeNull()
		expect(refusal(() => buildSucontRevoke(ADMIN, row({ module: "sucont-admin", level: 3 })))).toBeNull()
	})

	test("a tela usa a mesma regra", () => {
		expect(isSelfAdminRevoke(ADMIN, { userId: ADMIN, module: "sucont-admin", level: 3 })).toBe(true)
		expect(isSelfAdminRevoke(ADMIN, { userId: ADMIN, module: "sucont-admin", level: 0 })).toBe(false)
		expect(isSelfAdminRevoke(ADMIN, { userId: ADMIN, module: "sucont-1", level: 1 })).toBe(false)
		expect(isSelfAdminRevoke(ADMIN, { userId: OTHER, module: "sucont-admin", level: 3 })).toBe(false)
	})
})

describe("permissions.fn.ts — concessão e revogação auditadas", () => {
	const source = readFileSync(join(import.meta.dir, "..", "server", "permissions.fn.ts"), "utf8")

	test("grant e revoke passam por changeModulePermission com o ator da sessão", () => {
		expect(source).toContain("changeModulePermission(getAccessControlClient(), buildSucontGrant(ctx.userId, data))")
		expect(source).toContain("changeModulePermission(getAccessControlClient(), buildSucontRevoke(ctx.userId, row as SucontPermissionRow))")
	})

	test("nenhuma escrita direta em user_permissions (o banco a recusa desde 20260921130100)", () => {
		expect(source).not.toMatch(/from\("user_permissions"\)\s*\.(insert|update|upsert|delete)\(/)
		expect(source).not.toMatch(/grantUnscopedModulePermission|assertNotSelf/)
	})

	test("a revogação recebe só o id da linha e a lê restrita aos módulos do sucont", () => {
		const start = source.indexOf("export const revokeSucontPermissionFn")
		const body = source.slice(start, source.indexOf("export type SucontGrant", start))
		expect(body).toContain("z.object({ permissionId: z.uuid() })")
		expect(body).toContain('.in("module", MODULES)')
	})
})
