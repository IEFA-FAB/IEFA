#!/usr/bin/env bun
/**
 * Lint de Tailwind: as regras do `@shadcn/lint` rodando pelo Oxlint, com catraca por app.
 *
 * O Biome não aceita plugin, e o `@shadcn/lint` só roda como plugin de ESLint ou de Oxlint — por
 * isso um segundo linter, restrito a essas regras (`.oxlintrc.tailwind.jsonc`). Cada app com
 * `components.json` descobre o próprio tema sozinho: o sisub e o portal não se misturam.
 *
 *   - **erro** falha sempre. É o caso de `no-unknown-classes`: classe que não gera CSS nenhum.
 *   - **aviso** é dívida medida. A contagem por regra de cada app fica em
 *     `apps/<app>/tailwind-lint-baseline.json` e só pode descer: acima dela falha (aviso novo),
 *     abaixo também (baseline velho esconderia a próxima regressão) — `--update` regrava.
 *   - token de cor NÃO declarado (`bg-foregorund`) vem do `@shadcn/lint` como aviso de
 *     `no-raw-colors`, mas é classe que não gera CSS: sobe para erro aqui. Sem isso, corrigir uma
 *     cor crua e digitar um token errado deixaria a contagem igual e passaria.
 *   - qualquer aviso do próprio `@shadcn/lint` no stderr falha — o principal é o tema que não
 *     montou: sem ele `no-unknown-classes` cai numa gramática embutida que aceita classe inventada.
 *
 * As duas últimas dependem do TEXTO das mensagens da versão fixada. Mensagem de `no-raw-colors`
 * que não casa com nenhum dos dois formatos conhecidos vira erro — ao subir a versão, o lint
 * quebra alto em vez de passar a contar errado.
 *
 * Uso: `bun scripts/lint-tailwind.ts [app...] [--update]` — sem app, roda em todos.
 */

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const CONFIG = ".oxlintrc.tailwind.jsonc"
const BASELINE_FILE = "tailwind-lint-baseline.json"

type Diagnostic = {
	code: string
	severity: "error" | "warning"
	filename: string
	message: string
	labels: { span: { line: number; column: number } }[]
}
type Counts = Record<string, number>

const args = process.argv.slice(2)
const update = args.includes("--update")
const requested = args.filter((arg) => !arg.startsWith("--"))
const lintable = readdirSync(join(ROOT, "apps"))
	.filter((app) => existsSync(join(ROOT, "apps", app, "components.json")))
	.sort()

const unknown = requested.filter((app) => !lintable.includes(app))
if (unknown.length > 0) {
	console.error(`lint-tailwind: sem components.json, fora do lint: ${unknown.join(", ")}`)
	process.exit(1)
}
const apps = requested.length > 0 ? requested : lintable

const run = Bun.spawnSync([join(ROOT, "node_modules/.bin/oxlint"), "-c", CONFIG, "-f", "json", ...apps.map((app) => `apps/${app}/src`)], {
	cwd: ROOT,
	stdout: "pipe",
	stderr: "pipe",
})
const stderr = run.stderr.toString()
let diagnostics: Diagnostic[]
try {
	diagnostics = JSON.parse(run.stdout.toString()).diagnostics
} catch {
	console.error(`lint-tailwind: o oxlint não devolveu JSON (exit ${run.exitCode})\n${stderr}`)
	process.exit(1)
}

const ruleOf = (d: Diagnostic) => d.code.replace(/^shadcn\((.+)\)$/, "shadcn/$1")
const PALETTE = / uses the raw Tailwind palette\b| hardcodes a color\b/
const UNDECLARED = / is not a declared theme color\b/
/** Aviso que é dívida contável; o resto (token não declarado, formato desconhecido) é erro. */
const isDebt = (d: Diagnostic) => d.severity === "warning" && (ruleOf(d) !== "shadcn/no-raw-colors" || (PALETTE.test(d.message) && !UNDECLARED.test(d.message)))
const format = (d: Diagnostic) => {
	const span = d.labels[0]?.span
	return `  ${d.filename}:${span?.line ?? 0}:${span?.column ?? 0}  ${ruleOf(d)}  ${d.message}`
}

let failed = false
if (stderr.trim() !== "") console.error(stderr.trimEnd())
if (stderr.includes("[@shadcn/lint]")) {
	console.error("lint-tailwind: o @shadcn/lint avisou algo acima (tema que não montou cai na gramática embutida). Resolva antes de confiar no resultado.")
	failed = true
}

for (const app of apps) {
	const own = diagnostics.filter((d) => d.filename.startsWith(`apps/${app}/`))
	const warnings = own.filter(isDebt)
	const errors = own.filter((d) => !isDebt(d))
	let appFailed = false

	if (errors.length > 0) {
		console.error(`\n${app}: ${errors.length} erro(s)\n${errors.map(format).join("\n")}`)
		appFailed = true
	}

	const counts: Counts = {}
	for (const d of warnings) counts[ruleOf(d)] = (counts[ruleOf(d)] ?? 0) + 1
	const baselinePath = join(ROOT, "apps", app, BASELINE_FILE)

	if (update) {
		const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
		if (Object.keys(sorted).length === 0) rmSync(baselinePath, { force: true })
		// 2 espaços: é o que o Biome exige de JSON neste repo.
		else writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`)
		console.log(`${app}: baseline ${JSON.stringify(sorted)}`)
		if (appFailed) failed = true
		continue
	}

	const baseline: Counts = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {}
	for (const rule of new Set([...Object.keys(baseline), ...Object.keys(counts)])) {
		const found = counts[rule] ?? 0
		const allowed = baseline[rule] ?? 0
		if (found > allowed) {
			const list = warnings.filter((d) => ruleOf(d) === rule)
			console.error(`\n${app}: ${rule} subiu de ${allowed} para ${found}. Corrija o que entrou:\n${list.map(format).join("\n")}`)
			appFailed = true
		} else if (found < allowed) {
			console.error(`\n${app}: ${rule} desceu de ${allowed} para ${found}. Baixe o baseline: bun scripts/lint-tailwind.ts ${app} --update`)
			appFailed = true
		}
	}
	if (appFailed || failed) failed = true
	else console.log(`${app}: ok ${JSON.stringify(counts)}`)
}

process.exit(failed ? 1 : 0)
