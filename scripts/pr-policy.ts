#!/usr/bin/env bun
/**
 * O PR pode ser mergeado pelo agente, ou espera o mantenedor? (AGENTS.md > Workflow)
 *
 *   bun scripts/pr-policy.ts <n>     # arquivos do PR <n>
 *   bun scripts/pr-policy.ts         # arquivos da branch atual contra origin/main
 *
 * Imprime `auto` ou `maintainer` e, para `maintainer`, cada arquivo com o motivo. Sai 0 em
 * `auto` e 2 em `maintainer`, para a skill ship-pr decidir sem reler a lista à mão. A lista é
 * a do AGENTS.md; `pr-policy.test.ts` falha se um caminho citado lá não cair numa regra daqui.
 *
 * - Arquivo renomeado conta pelos dois caminhos: mover um gate para fora do lugar dele é mexer
 *   no gate.
 * - Roda sempre as regras da `main`: o script é ele mesmo um gate, e o PR que o altera não
 *   pode decidir com a própria cópia.
 * - Por caminho não se vê tudo: grant, RLS e policy fora de migration, segredo e variável de
 *   produção num arquivo qualquer. A skill continua lendo o diff.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export type MaintainerRule = { pattern: RegExp; reason: string }

export const MAINTAINER_RULES: readonly MaintainerRule[] = [
	{ pattern: /^packages\/database\/supabase\/migrations\//, reason: "migration nova ou alterada (inclui grant, RLS, policy e documento legal)" },
	{ pattern: /^infra\//, reason: "infra/**" },
	{ pattern: /^secrets\/|(^|\/)\.env\.schema$|(^|\/)terraform\.tfvars/, reason: "segredo ou variável de produção" },
	{ pattern: /^\.github\//, reason: "definição de gate (.github/**)" },
	{ pattern: /^\.opengrep\/rules\//, reason: "definição de gate (.opengrep/rules/)" },
	{ pattern: /^\.claude\/hooks\//, reason: "definição de gate (.claude/hooks/)" },
	{ pattern: /^\.claude\/settings\.json$/, reason: "definição de gate (.claude/settings.json)" },
	{ pattern: /^commitlint\.config\.ts$/, reason: "definição de gate (commitlint.config.ts)" },
	{ pattern: /^biome\.json$/, reason: "definição de gate (biome.json)" },
	{ pattern: /^\.oxlintrc\.tailwind\.jsonc$/, reason: "definição de gate (.oxlintrc.tailwind.jsonc)" },
	{ pattern: /(^|\/)turbo\.json$/, reason: "definição de gate (turbo.json)" },
	{ pattern: /^scripts\/pr-policy\.ts$/, reason: "definição de gate (esta política)" },
]

export type PolicyVerdict = { decision: "auto" | "maintainer"; matches: Array<{ file: string; reason: string }> }

export function classifyPrFiles(files: readonly string[]): PolicyVerdict {
	const matches = files.flatMap((file) => {
		const rule = MAINTAINER_RULES.find(({ pattern }) => pattern.test(file))
		return rule ? [{ file, reason: rule.reason }] : []
	})
	return { decision: matches.length > 0 ? "maintainer" : "auto", matches }
}

function run(cmd: string[]): string {
	const proc = Bun.spawnSync(cmd, { stderr: "inherit" })
	if (proc.exitCode !== 0) process.exit(proc.exitCode ?? 1)
	return proc.stdout.toString()
}

/** Caminhos do PR, com o de origem dos renomeados. */
function changedFiles(pr: string | undefined): string[] {
	if (pr) {
		const out = run(["gh", "api", `repos/{owner}/{repo}/pulls/${pr}/files`, "--paginate", "--jq", ".[] | .filename, (.previous_filename // empty)"])
		return out.split("\n").filter(Boolean)
	}
	// `--name-status -M`: renomeado sai como `R<n>\t<antigo>\t<novo>`.
	const out = run(["git", "diff", "--name-status", "-M", "origin/main...HEAD"])
	return out
		.split("\n")
		.flatMap((line) => line.split("\t").slice(1))
		.filter(Boolean)
}

/** Fonte desta política na `main`, se diferente da local; `null` se igual ou se a main não a tem. */
function mainCopy(): string | null {
	const proc = Bun.spawnSync(["git", "show", "origin/main:scripts/pr-policy.ts"], { stderr: "pipe" })
	if (proc.exitCode !== 0) return null
	const source = proc.stdout.toString()
	return source === readFileSync(import.meta.path, "utf8") ? null : source
}

if (import.meta.main) {
	const main = process.env.PR_POLICY_FROM_MAIN ? null : mainCopy()
	if (main) {
		const file = join(mkdtempSync(join(tmpdir(), "pr-policy-")), "pr-policy.ts")
		writeFileSync(file, main)
		console.error("(regras da origin/main: a cópia local difere)")
		const proc = Bun.spawnSync(["bun", file, ...process.argv.slice(2)], {
			stdout: "inherit",
			stderr: "inherit",
			env: { ...process.env, PR_POLICY_FROM_MAIN: "1" },
		})
		process.exit(proc.exitCode ?? 1)
	}
	const verdict = classifyPrFiles(changedFiles(process.argv[2]))
	console.log(verdict.decision)
	for (const { file, reason } of verdict.matches) console.log(`  ${file} — ${reason}`)
	process.exit(verdict.decision === "auto" ? 0 : 2)
}
