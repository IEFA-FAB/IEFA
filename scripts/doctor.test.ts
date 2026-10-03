import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readPinnedVersions, runChecks } from "./doctor"

describe("readPinnedVersions", () => {
	test("lê as versões que o security.yml fixa", () => {
		const pins = readPinnedVersions(readFileSync(join(import.meta.dir, "../.github/workflows/security.yml"), "utf8"))
		for (const tool of ["opengrep", "gitleaks", "actionlint", "shellcheck"]) expect(pins[tool], tool).toMatch(/^\d+\.\d+/)
	})

	test("ignora o que não é VERSION", () => {
		expect(readPinnedVersions('env:\n  OPENGREP_VERSION: "1.2.3"\n  OPENGREP_SHA256: "abc"\n')).toEqual({ opengrep: "1.2.3" })
	})
})

describe("runChecks", () => {
	test("cobre o que a worktree precisa, cada item com status e detalhe", () => {
		const checks = runChecks()
		expect(checks.map((check) => check.name)).toEqual(
			expect.arrayContaining(["node_modules", "bun", "hooks de commit", ".env dos apps", "opengrep", "gitleaks"])
		)
		for (const check of checks) expect(check.detail.length, check.name).toBeGreaterThan(0)
	})
})
