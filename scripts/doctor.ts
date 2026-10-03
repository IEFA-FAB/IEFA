#!/usr/bin/env bun
/**
 * O que esta worktree precisa para rodar os mesmos gates do CI? (`bun run doctor`)
 *
 * Worktree nova falhava calada em vários pontos: `prepare` sem credencial AWS sai 0 e o `.env`
 * não vem; sem gitleaks o pre-commit segue com um aviso; opengrep, actionlint e shellcheck não
 * se instalam sozinhos e o `scan:rules` local simplesmente não roda; o `.mcp.json` (marcado
 * skip-worktree, com caminhos locais) fora do formato do Biome trava o pre-commit com o
 * `git status` limpo. Cada linha diz o que falta e o comando que resolve.
 *
 * As versões vêm do bloco `env:` do topo do `security.yml` (as que o CI fixa), não de uma
 * lista daqui. Sai 1 só quando falta o que impede commitar (node_modules, hooks); o resto é
 * aviso.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")

type Status = "ok" | "warn" | "fail"
export type Check = { name: string; status: Status; detail: string }

/** O que o doctor lê do mundo: injetável para os testes não dependerem da máquina. */
export type DoctorIO = {
	run: (cmd: string[]) => { ok: boolean; out: string }
	exists: (path: string) => boolean
	read: (path: string) => string
	bunVersion: string
}

const realIO: DoctorIO = {
	run: (cmd) => {
		try {
			const proc = Bun.spawnSync(cmd, { cwd: ROOT, stderr: "pipe" })
			return { ok: proc.exitCode === 0, out: `${proc.stdout.toString()}${proc.stderr.toString()}`.trim() }
		} catch {
			return { ok: false, out: "" }
		}
	},
	exists: (path) => existsSync(join(ROOT, path)),
	read: (path) => readFileSync(join(ROOT, path), "utf8"),
	bunVersion: Bun.version,
}

/** `X_VERSION: "1.2.3"` (aspas opcionais) do bloco `env:` do TOPO do workflow; env de job não conta. */
export function readPinnedVersions(workflow: string): Record<string, string> {
	const lines = workflow.split("\n")
	const start = lines.findIndex((line) => /^env:\s*$/.test(line))
	const pins: Record<string, string> = {}
	if (start === -1) return pins
	for (const line of lines.slice(start + 1)) {
		if (/^\S/.test(line)) break
		const match = /^ {2}([A-Z]+)_VERSION:\s*"?([^"\s#]+)"?/.exec(line)
		if (match) pins[(match[1] as string).toLowerCase()] = match[2] as string
	}
	return pins
}

/** Primeira versão `x.y.z` da saída de `--version`. */
export function extractVersion(output: string): string | null {
	return /\b(\d+\.\d+\.\d+)\b/.exec(output)?.[1] ?? null
}

const INSTALL: Record<string, string> = {
	opengrep: "Baixe `opengrep_manylinux_x86` da release v{v} (https://github.com/opengrep/opengrep/releases) e confira o sha256 do security.yml.",
	gitleaks: "Baixe `gitleaks_{v}_linux_x64.tar.gz` (https://github.com/gitleaks/gitleaks/releases) e confira o sha256 do security.yml.",
	actionlint: "Baixe `actionlint_{v}_linux_amd64.tar.gz` (https://github.com/rhysd/actionlint/releases) e confira o sha256 do security.yml.",
	shellcheck: "Baixe `shellcheck-v{v}.linux.x86_64.tar.xz` (https://github.com/koalaman/shellcheck/releases) e confira o sha256 do security.yml.",
}

const VERSION_ARGS: Record<string, string[]> = {
	opengrep: ["--version"],
	gitleaks: ["version"],
	actionlint: ["-version"],
	shellcheck: ["--version"],
}

function checkBinary(io: DoctorIO, name: string, pinned: string | undefined): Check {
	const install = (INSTALL[name] ?? "").replaceAll("{v}", pinned ?? "<versão>")
	const probe = io.run([name, ...(VERSION_ARGS[name] ?? ["--version"])])
	if (!probe.ok) return { name, status: "warn", detail: `ausente. ${install}` }
	const local = extractVersion(probe.out)
	if (pinned && local !== pinned) return { name, status: "warn", detail: `${local ?? "versão ilegível"} local, o CI usa ${pinned}. ${install}` }
	return { name, status: "ok", detail: pinned ? `${pinned}, igual à do CI` : (local ?? "instalado") }
}

export function runChecks(io: DoctorIO = realIO): Check[] {
	const checks: Check[] = []

	checks.push(
		io.exists("node_modules")
			? { name: "node_modules", status: "ok", detail: "instalado" }
			: { name: "node_modules", status: "fail", detail: "ausente: rode `bun install` (instala também os hooks de commit)" }
	)

	const packageManager = (JSON.parse(io.read("package.json")) as { packageManager?: string }).packageManager ?? ""
	const pinnedBun = packageManager.startsWith("bun@") ? packageManager.slice(4) : null
	checks.push(
		!pinnedBun
			? { name: "bun", status: "warn", detail: "package.json sem `packageManager: bun@x.y.z`" }
			: io.bunVersion === pinnedBun
				? { name: "bun", status: "ok", detail: `${io.bunVersion}, igual ao packageManager` }
				: {
						name: "bun",
						status: "warn",
						detail: `${io.bunVersion} local, o CI usa ${pinnedBun} (packageManager). Patch do Bun já mudou install e lockfile aqui.`,
					}
	)

	// O `core.hooksPath` fica na config compartilhada entre worktrees; o `.husky/_` é por worktree
	// e só nasce no `prepare` do `bun install`. Sem ele o git não roda hook nenhum, calado.
	const hooksPath = io.run(["git", "config", "--get", "core.hooksPath"]).out
	const hooksInstalled = hooksPath.length > 0 && io.exists(join(hooksPath, "pre-commit"))
	checks.push(
		hooksInstalled
			? { name: "hooks de commit", status: "ok", detail: "husky ativo (commitlint, format, gitleaks)" }
			: {
					name: "hooks de commit",
					status: "fail",
					detail: `hooks ausentes nesta worktree (core.hooksPath=${hooksPath || "vazio"}): rode \`bun install\` sem --ignore-scripts nem HUSKY=0`,
				}
	)

	if (io.exists(".mcp.json")) {
		const flag = io.run(["git", "ls-files", "-v", ".mcp.json"]).out
		const formatted = io.run(["bunx", "biome", "format", ".mcp.json"]).ok
		checks.push(
			!flag.startsWith("S ")
				? { name: ".mcp.json", status: "warn", detail: "sem skip-worktree: os caminhos locais entram no diff. `git update-index --skip-worktree .mcp.json`" }
				: !formatted
					? {
							name: ".mcp.json",
							status: "warn",
							detail: "fora do formato do Biome: trava o pre-commit com o `git status` limpo. `bunx biome format --write .mcp.json`",
						}
					: { name: ".mcp.json", status: "ok", detail: "skip-worktree marcado e formatado" }
		)
	}

	// Mesma seleção do `env:pull`: apps do manifesto que não são alias. Imagem de terceiro
	// (kind dockerfile) não tem `.env` local.
	const manifest = JSON.parse(io.read("apps.manifest.json")) as { apps: Array<{ key: string; path: string; aliasOf?: string; kind?: string }> }
	const envApps = manifest.apps.filter((app) => !app.aliasOf && app.kind !== "dockerfile")
	const missingEnv = envApps.filter((app) => !io.exists(join(app.path, ".env")))
	checks.push(
		missingEnv.length === 0
			? { name: ".env dos apps", status: "ok", detail: `${envApps.length} apps com .env` }
			: {
					name: ".env dos apps",
					status: "warn",
					detail: `sem .env: ${missingEnv.map((app) => app.key).join(", ")}. \`bun run env:pull\` (precisa de credencial AWS; os testes unitários não dependem dele)`,
				}
	)

	const pins = readPinnedVersions(io.read(".github/workflows/security.yml"))
	for (const tool of ["opengrep", "gitleaks", "actionlint", "shellcheck"]) checks.push(checkBinary(io, tool, pins[tool]))
	return checks
}

if (import.meta.main) {
	const checks = runChecks()
	const icon: Record<Status, string> = { ok: "✓", warn: "!", fail: "✗" }
	for (const check of checks) console.log(`${icon[check.status]} ${check.name.padEnd(16)} ${check.detail}`)
	process.exit(checks.some((check) => check.status === "fail") ? 1 : 0)
}
