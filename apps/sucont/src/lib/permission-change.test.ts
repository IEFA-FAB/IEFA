import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { GrantNotAllowedError } from "@iefa/pbac"
import { buildSucontGrant, buildSucontRevoke, isSelfAdminRevoke } from "./permission-change"

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

describe("buildSucontRevoke", () => {
	test("revoga a chave global inteira do módulo (allow e deny), como a tela sempre fez", () => {
		expect(buildSucontRevoke(ADMIN, { userId: OTHER, module: "sucont-4" })).toMatchObject({
			action: "revoke",
			targetUserId: OTHER,
			module: "sucont-4",
			unitId: null,
			partition: "all",
		})
	})

	test("ninguém revoga a própria administração; a própria divisão pode sair", () => {
		expect(refusal(() => buildSucontRevoke(ADMIN, { userId: ADMIN, module: "sucont-admin" }))).toBe("SELF_LOCKOUT")
		expect(refusal(() => buildSucontRevoke(ADMIN, { userId: ADMIN, module: "sucont-3" }))).toBeNull()
		expect(refusal(() => buildSucontRevoke(ADMIN, { userId: OTHER, module: "sucont-admin" }))).toBeNull()
	})

	test("a tela usa a mesma regra", () => {
		expect(isSelfAdminRevoke(ADMIN, { userId: ADMIN, module: "sucont-admin" })).toBe(true)
		expect(isSelfAdminRevoke(ADMIN, { userId: ADMIN, module: "sucont-1" })).toBe(false)
		expect(isSelfAdminRevoke(ADMIN, { userId: OTHER, module: "sucont-admin" })).toBe(false)
	})
})

describe("permissions.fn.ts — concessão e revogação auditadas", () => {
	const source = readFileSync(join(import.meta.dir, "..", "server", "permissions.fn.ts"), "utf8")

	test("grant e revoke passam por changeModulePermission com o ator da sessão", () => {
		expect(source).toContain("changeModulePermission(getAccessControlClient(), buildSucontGrant(ctx.userId, data))")
		expect(source).toContain("changeModulePermission(getAccessControlClient(), buildSucontRevoke(ctx.userId, data))")
	})

	test("nenhuma escrita direta em user_permissions (o banco a recusa desde 20260921120100)", () => {
		expect(source).not.toMatch(/from\("user_permissions"\)\s*\.(insert|update|upsert|delete)\(/)
		expect(source).not.toMatch(/grantUnscopedModulePermission|assertNotSelf/)
	})
})
