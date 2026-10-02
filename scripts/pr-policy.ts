#!/usr/bin/env bun
/**
 * O PR pode ser mergeado pelo agente, ou espera o mantenedor? (AGENTS.md > Workflow)
 *
 *   bun scripts/pr-policy.ts <n>     # arquivos do PR <n> (gh pr diff --name-only)
 *   bun scripts/pr-policy.ts         # arquivos da branch atual contra origin/main
 *
 * Imprime `auto` ou `maintainer` e, para `maintainer`, cada arquivo com o motivo. Sai 0 em
 * `auto` e 2 em `maintainer`, para a skill ship-pr decidir sem reler a lista à mão. A lista
 * é a do AGENTS.md: mudar uma exige mudar a outra.
 *
 * Por caminho não se vê tudo: grant, RLS e policy fora de migration, segredo e variável de
 * produção num arquivo qualquer. A skill continua lendo o diff; o script cobre o que o
 * caminho decide.
 */

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
]

export type PolicyVerdict = { decision: "auto" | "maintainer"; matches: Array<{ file: string; reason: string }> }

export function classifyPrFiles(files: readonly string[]): PolicyVerdict {
	const matches = files.flatMap((file) => {
		const rule = MAINTAINER_RULES.find(({ pattern }) => pattern.test(file))
		return rule ? [{ file, reason: rule.reason }] : []
	})
	return { decision: matches.length > 0 ? "maintainer" : "auto", matches }
}

function changedFiles(pr: string | undefined): string[] {
	const cmd = pr ? ["gh", "pr", "diff", pr, "--name-only"] : ["git", "diff", "--name-only", "origin/main...HEAD"]
	const proc = Bun.spawnSync(cmd, { stderr: "inherit" })
	if (proc.exitCode !== 0) process.exit(proc.exitCode ?? 1)
	return proc.stdout.toString().split("\n").filter(Boolean)
}

if (import.meta.main) {
	const verdict = classifyPrFiles(changedFiles(process.argv[2]))
	console.log(verdict.decision)
	for (const { file, reason } of verdict.matches) console.log(`  ${file} — ${reason}`)
	process.exit(verdict.decision === "auto" ? 0 : 2)
}
