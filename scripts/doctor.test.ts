import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type DoctorIO, extractVersion, readPinnedVersions, runChecks } from "./doctor"

const SECURITY = readFileSync(join(import.meta.dir, "../.github/workflows/security.yml"), "utf8")

/** Máquina falsa: tudo instalado e na versão do CI, salvo o que o teste sobrescrever. */
function fakeIO(overrides: Partial<DoctorIO> & { files?: Record<string, boolean>; outputs?: Record<string, { ok: boolean; out: string }> } = {}): DoctorIO {
	const pins = readPinnedVersions(SECURITY)
	const outputs: Record<string, { ok: boolean; out: string }> = {
		"git config --get core.hooksPath": { ok: true, out: ".husky/_" },
		"git ls-files -v .mcp.json": { ok: true, out: "S .mcp.json" },
		"bunx biome format .mcp.json": { ok: true, out: "" },
		"opengrep --version": { ok: true, out: pins.opengrep ?? "" },
		"gitleaks version": { ok: true, out: pins.gitleaks ?? "" },
		"actionlint -version": { ok: true, out: `${pins.actionlint}\ninstalled by downloading` },
		"shellcheck --version": { ok: true, out: `ShellCheck - shell script analysis tool\nversion: ${pins.shellcheck}` },
		...overrides.outputs,
	}
	return {
		run: (cmd) => outputs[cmd.join(" ")] ?? { ok: false, out: "" },
		exists: (path) => overrides.files?.[path] ?? true,
		read: (path) => (path === "package.json" ? JSON.stringify({ packageManager: "bun@1.4.0" }) : readFileSync(join(import.meta.dir, "..", path), "utf8")),
		bunVersion: "1.4.0",
		...overrides,
	}
}

const byName = (io: DoctorIO, name: string) => runChecks(io).find((check) => check.name === name)

describe("readPinnedVersions", () => {
	test("lê as versões do bloco env: do topo do security.yml", () => {
		const pins = readPinnedVersions(SECURITY)
		for (const tool of ["opengrep", "gitleaks", "actionlint", "shellcheck"]) expect(pins[tool], tool).toMatch(/^\d+\.\d+\.\d+$/)
	})

	test("env de job não sobrescreve o do topo; aspas são opcionais; SHA256 não é versão", () => {
		const workflow = 'env:\n  OPENGREP_VERSION: 1.2.3\n  OPENGREP_SHA256: "abc"\njobs:\n  x:\n    env:\n      OPENGREP_VERSION: "9.9.9-rc"\n'
		expect(readPinnedVersions(workflow)).toEqual({ opengrep: "1.2.3" })
	})
})

describe("extractVersion", () => {
	test("pega a versão inteira, sem casar prefixo", () => {
		expect(extractVersion("8.30.10")).toBe("8.30.10")
		expect(extractVersion("ShellCheck\nversion: 0.11.0\nlicense")).toBe("0.11.0")
		expect(extractVersion("nada")).toBeNull()
	})
})

describe("runChecks", () => {
	test("máquina igual ao CI: nenhum aviso", () => {
		expect(runChecks(fakeIO()).filter((check) => check.status !== "ok")).toEqual([])
	})

	test("core.hooksPath configurado mas sem .husky/_ nesta worktree: falha", () => {
		expect(byName(fakeIO({ files: { ".husky/_/pre-commit": false } }), "hooks de commit")?.status).toBe("fail")
	})

	test("versão que contém a do CI como prefixo não passa por igual", () => {
		const pins = readPinnedVersions(SECURITY)
		const check = byName(fakeIO({ outputs: { "gitleaks version": { ok: true, out: `${pins.gitleaks}0` } } }), "gitleaks")
		expect(check?.status).toBe("warn")
		expect(check?.detail).toContain("github.com/gitleaks/gitleaks/releases")
	})

	test(".mcp.json marcado mas fora do formato: avisa com o comando", () => {
		const check = byName(fakeIO({ outputs: { "bunx biome format .mcp.json": { ok: false, out: "" } } }), ".mcp.json")
		expect(check?.status).toBe("warn")
		expect(check?.detail).toContain("biome format --write .mcp.json")
	})

	test("patch do Bun diferente do packageManager: avisa", () => {
		expect(byName(fakeIO({ bunVersion: "1.4.2" }), "bun")?.status).toBe("warn")
	})

	test(".env: mesma seleção do env:pull (sem alias nem imagem de terceiro)", () => {
		const check = byName(fakeIO({ exists: (path) => !path.endsWith(".env") }), ".env dos apps")
		expect(check?.detail).toContain("sisub")
		expect(check?.detail).not.toContain("5s")
		expect(check?.detail).not.toContain("pdf")
	})
})
