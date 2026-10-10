#!/usr/bin/env bun
/**
 * Typecheck do workspace com o type checker do Bun (`bun --check`). É o script `typecheck` dos
 * workspaces: `"typecheck": "bun ../../scripts/typecheck.ts"`.
 *
 * Existe para travar a versão. Antes do 1.4.3, `bun --check` sem arquivo imprime o help e sai 0:
 * o typecheck passaria sem checar tipo nenhum, e o turbo guardaria esse verde no cache. O piso é o
 * `packageManager` da raiz, o mesmo Bun do CI.
 *
 * Não use `bun check` (sem os traços) em script: o script `check` do workspace tem precedência e
 * roda no lugar do type checker (regra `bun-check-in-script` do opengrep).
 */

import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const { packageManager = "" } = (await Bun.file(join(ROOT, "package.json")).json()) as { packageManager?: string }
const pinned = packageManager.startsWith("bun@") ? packageManager.slice(4) : null

if (!pinned) {
	console.error("typecheck: package.json da raiz sem `packageManager: bun@x.y.z`")
	process.exit(1)
}
if (Bun.semver.order(Bun.version, pinned) < 0) {
	console.error(
		`typecheck: Bun ${Bun.version} é anterior ao ${pinned} do packageManager; antes do 1.4.3 o \`bun --check\` não checa tipo. Rode \`bun upgrade\`.`
	)
	process.exit(1)
}

const proc = Bun.spawnSync([process.execPath, "--check", ...process.argv.slice(2)], { stdio: ["inherit", "inherit", "inherit"] })
process.exit(proc.exitCode ?? 1)
