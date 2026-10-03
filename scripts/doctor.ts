#!/usr/bin/env bun
/**
 * O que esta worktree precisa para rodar os mesmos gates do CI? (`bun run doctor`)
 *
 * Worktree nova falhava calada em vários pontos: `prepare` sem credencial AWS sai 0 e o `.env`
 * não vem; sem gitleaks o pre-commit segue com um aviso; opengrep, actionlint e shellcheck não
 * se instalam sozinhos e o `scan:rules` local simplesmente não roda; o `.mcp.json` perde o
 * skip-worktree e trava o pre-commit. Cada linha diz o que falta e o comando que resolve.
 *
 * As versões vêm do próprio `security.yml` (as que o CI fixa), não de uma lista daqui.
 * Sai 1 só quando falta o que impede commitar (node_modules, hooks); o resto é aviso.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")

type Status = "ok" | "warn" | "fail"
export type Check = { name: string; status: Status; detail: string }

/** Versões fixadas no workflow: `OPENGREP_VERSION: "1.30.0"` → { opengrep: "1.30.0" }. */
export function readPinnedVersions(workflow: string): Record<string, string> {
	const pins: Record<string, string> = {}
	for (const match of workflow.matchAll(/^\s+([A-Z]+)_VERSION:\s*"([^"]+)"/gm)) pins[(match[1] as string).toLowerCase()] = match[2] as string
	return pins
}

function run(cmd: string[]): { ok: boolean; out: string } {
	try {
		const proc = Bun.spawnSync(cmd, { cwd: ROOT, stderr: "pipe" })
		return { ok: proc.exitCode === 0, out: `${proc.stdout.toString()}${proc.stderr.toString()}`.trim() }
	} catch {
		return { ok: false, out: "" }
	}
}

/** Binário com a versão que o CI fixa; ausente é aviso, versão diferente também. */
function checkBinary(name: string, versionArgs: string[], pinned: string | undefined, install: string): Check {
	const probe = run([name, ...versionArgs])
	if (!probe.ok) return { name, status: "warn", detail: `ausente. ${install}` }
	if (pinned && !probe.out.includes(pinned)) return { name, status: "warn", detail: `versão local difere da do CI (${pinned}): ${probe.out.split("\n")[0]}` }
	return { name, status: "ok", detail: pinned ? `versão ${pinned}, igual à do CI` : (probe.out.split("\n")[0] ?? "") }
}

export function runChecks(): Check[] {
	const checks: Check[] = []
	const pins = readPinnedVersions(readFileSync(join(ROOT, ".github/workflows/security.yml"), "utf8"))

	checks.push(
		existsSync(join(ROOT, "node_modules"))
			? { name: "node_modules", status: "ok", detail: "instalado" }
			: { name: "node_modules", status: "fail", detail: "ausente: rode `bun install` (instala também os hooks de commit)" }
	)

	const pinnedBun = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).packageManager as string).replace("bun@", "")
	const sameMinor = Bun.version.split(".").slice(0, 2).join(".") === pinnedBun.split(".").slice(0, 2).join(".")
	checks.push(
		Bun.version === pinnedBun
			? { name: "bun", status: "ok", detail: `${Bun.version}, igual ao packageManager` }
			: {
					name: "bun",
					status: sameMinor ? "ok" : "warn",
					detail: `${Bun.version} local, o CI usa ${pinnedBun} (packageManager)${sameMinor ? ": mesmo minor" : ": instale a do packageManager"}`,
				}
	)

	const hooksPath = run(["git", "config", "--get", "core.hooksPath"]).out
	checks.push(
		hooksPath === ".husky/_"
			? { name: "hooks de commit", status: "ok", detail: "husky ativo (commitlint, format, gitleaks)" }
			: { name: "hooks de commit", status: "fail", detail: `husky inativo (core.hooksPath=${hooksPath || "vazio"}): rode \`bun install\`` }
	)

	const mcp = run(["git", "ls-files", "-v", ".mcp.json"]).out
	if (mcp) {
		checks.push(
			mcp.startsWith("S ")
				? { name: ".mcp.json", status: "ok", detail: "skip-worktree marcado" }
				: { name: ".mcp.json", status: "warn", detail: "sem skip-worktree: edição local entra no diff. `git update-index --skip-worktree .mcp.json`" }
		)
	}

	const appsWithSchema = readdirSync(join(ROOT, "apps")).filter((app) => existsSync(join(ROOT, "apps", app, ".env.schema")))
	const missingEnv = appsWithSchema.filter((app) => !existsSync(join(ROOT, "apps", app, ".env")))
	checks.push(
		missingEnv.length === 0
			? { name: ".env dos apps", status: "ok", detail: `${appsWithSchema.length} apps com .env` }
			: {
					name: ".env dos apps",
					status: "warn",
					detail: `sem .env: ${missingEnv.join(", ")}. \`bun run env:pull\` (precisa de credencial AWS; os testes unitários não dependem dele)`,
				}
	)

	checks.push(checkBinary("opengrep", ["--version"], pins.opengrep, "Gate `scan:rules`; baixe a release fixada no security.yml (sha256 lá)."))
	checks.push(checkBinary("gitleaks", ["version"], pins.gitleaks, "Sem ele o pre-commit segue sem procurar segredo."))
	checks.push(checkBinary("actionlint", ["-version"], pins.actionlint, "Lint dos workflows (job do security.yml)."))
	checks.push(checkBinary("shellcheck", ["--version"], pins.shellcheck, "Usado pelo actionlint nos `run:`."))
	return checks
}

if (import.meta.main) {
	const checks = runChecks()
	const icon: Record<Status, string> = { ok: "✓", warn: "!", fail: "✗" }
	for (const check of checks) console.log(`${icon[check.status]} ${check.name.padEnd(16)} ${check.detail}`)
	process.exit(checks.some((check) => check.status === "fail") ? 1 : 0)
}
