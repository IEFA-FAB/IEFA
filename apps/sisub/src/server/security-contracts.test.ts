import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const serverDir = dirname(fileURLToPath(import.meta.url))

function readServerFile(fileName: string) {
	return readFileSync(join(serverDir, fileName), "utf8")
}

describe("server function security contracts", () => {
	// Since the Onda 4 migration the admin guard lives in two layers:
	//   - the server fn authenticates (requireAuth) and forwards the ctx
	//   - the @iefa/sisub-domain operation enforces global level 2
	test("permission admin functions require auth and forward ctx to a global-write-guarded domain op", () => {
		const source = readServerFile("permissions.fn.ts")
		const domainSource = readFileSync(join(serverDir, "../../../../packages/sisub-domain/src/operations/permissions.ts"), "utf8")

		expect(source).toContain("requireAuth")

		for (const { fn, op } of [
			{ fn: "searchUsersByEmailFn", op: "searchUsersByEmail" },
			{ fn: "fetchUserPermissionsAdminFn", op: "fetchUserPermissionsAdmin" },
			{ fn: "createUserPermissionFn", op: "createUserPermission" },
			{ fn: "updateUserPermissionFn", op: "updateUserPermission" },
			{ fn: "deleteUserPermissionFn", op: "deleteUserPermission" },
		]) {
			const fnStart = source.indexOf(`export const ${fn}`)
			expect(fnStart).toBeGreaterThan(-1)
			const nextExport = source.indexOf("export const ", fnStart + 1)
			const fnSource = source.slice(fnStart, nextExport === -1 ? undefined : nextExport)
			// authenticate, then forward the resolved ctx into the domain op
			expect(fnSource).toContain("const ctx = await requireAuth()")
			expect(fnSource).toContain(`${op}(getSupabaseServerClient(), ctx,`)

			// the domain op enforces global level-2 (write) before touching the DB
			const opStart = domainSource.indexOf(`export async function ${op}(`)
			expect(opStart).toBeGreaterThan(-1)
			const nextOp = domainSource.indexOf("export async function ", opStart + 1)
			const opSource = domainSource.slice(opStart, nextOp === -1 ? undefined : nextOp)
			expect(opSource).toContain('requirePermission(ctx, "global", 2)')
		}
	})

	test("places and settings write functions require authentication before service-role writes", () => {
		for (const fileName of ["places.fn.ts", "unit-settings.fn.ts", "kitchen-settings.fn.ts"]) {
			const source = readServerFile(fileName)
			const postHandlers = source.match(
				/createServerFn\(\{ method: "POST" \}\)[\s\S]*?\.handler\(async \(\{ data \}\) => \{[\s\S]*?getSupabaseServerClient\(\)/g
			)

			expect(postHandlers?.length ?? 0).toBeGreaterThan(0)
			for (const handler of postHandlers ?? []) {
				expect(handler).toContain("requireAuth()")
				expect(handler.indexOf("requireAuth()")).toBeLessThan(handler.indexOf("getSupabaseServerClient()"))
			}
		}
	})
})
