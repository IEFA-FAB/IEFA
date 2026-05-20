import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const serverDir = dirname(fileURLToPath(import.meta.url))

function readServerFile(fileName: string) {
	return readFileSync(join(serverDir, fileName), "utf8")
}

describe("server function security contracts", () => {
	test("permission admin functions require auth and global write permission", () => {
		const source = readServerFile("permissions.fn.ts")

		expect(source).toContain("requireAuth")
		expect(source).toContain('requirePermission(ctx, "global", 2)')

		for (const fnName of [
			"searchUsersByEmailFn",
			"fetchUserPermissionsAdminFn",
			"createUserPermissionFn",
			"updateUserPermissionFn",
			"deleteUserPermissionFn",
		]) {
			const fnStart = source.indexOf(`export const ${fnName}`)
			expect(fnStart).toBeGreaterThan(-1)
			const nextExport = source.indexOf("export const ", fnStart + 1)
			const fnSource = source.slice(fnStart, nextExport === -1 ? undefined : nextExport)
			expect(fnSource).toContain("requireGlobalPermissionAdmin()")
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
