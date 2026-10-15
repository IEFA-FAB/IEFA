#!/usr/bin/env bun
/**
 * Catraca do react-doctor por app: as regras que estavam desligadas no `doctor.config.json` voltaram,
 * e o que elas acham hoje é dívida medida, no mesmo molde do `lint-tailwind.ts`.
 *
 *   - Só as regras de `RATCHETED_RULES` contam. O resto do relatório do doctor segue consultivo
 *     (`bunx react-doctor apps/<app> --verbose`): entrar na catraca é decisão por regra.
 *   - A contagem por regra fica em `apps/<app>/react-doctor-baseline.json` e só pode descer: acima
 *     dela falha (achado novo), abaixo também (baseline velho esconderia a próxima regressão).
 *     `--update` regrava. Regra fora do arquivo vale 0.
 *   - Falso positivo não entra no baseline: leva supressão pontual com o motivo,
 *     `// react-doctor-disable-next-line <regra> -- <motivo>`.
 *
 * Roda o doctor só com o lint (sem score, sem telemetria, sem a varredura de dependências do
 * Socket.dev, que vai à rede): o resultado depende só do código e da versão fixada no package.json.
 *
 * Uso: `bun scripts/lint-react-doctor.ts [app...] [--update]` — sem app, roda em todos os que têm
 * `doctor.config.json`.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const BASELINE_FILE = "react-doctor-baseline.json"

/** Regras religadas em 2026-10 (estavam desligadas sem motivo no `doctor.config.json` do sisub). */
const RATCHETED_RULES = [
	"react-doctor/query-mutation-missing-invalidation",
	"react-hooks-js/refs",
	"react-hooks-js/set-state-in-effect",
	"react-hooks-js/todo",
] as const

type Diagnostic = { filePath: string; plugin: string; rule: string; line: number; column: number; message: string; help?: string }
type Report = { ok: boolean; error?: unknown; diagnostics: Diagnostic[]; projects: { complete?: boolean }[] }
type Counts = Record<string, number>

const args = process.argv.slice(2)
const update = args.includes("--update")
const requested = args.filter((arg) => !arg.startsWith("--"))
const doctorApps = readdirSync(join(ROOT, "apps"))
	.filter((app) => existsSync(join(ROOT, "apps", app, "doctor.config.json")))
	.sort()

const unknown = requested.filter((app) => !doctorApps.includes(app))
if (unknown.length > 0) {
	console.error(`lint-react-doctor: sem doctor.config.json, fora da catraca: ${unknown.join(", ")}`)
	process.exit(1)
}
const apps = requested.length > 0 ? requested : doctorApps

const getRuleName = (d: Diagnostic) => `${d.plugin}/${d.rule}`
const isRatcheted = (rule: string): boolean => (RATCHETED_RULES as readonly string[]).includes(rule)

function scanApp(app: string): Diagnostic[] {
	const outDir = mkdtempSync(join(tmpdir(), "react-doctor-"))
	const out = join(outDir, "report.json")
	try {
		const run = Bun.spawnSync(
			[
				join(ROOT, "node_modules/.bin/react-doctor"),
				`apps/${app}`,
				"--json",
				"--json-out",
				out,
				"--no-score",
				"--no-supply-chain",
				"--blocking",
				"none",
				"--yes",
			],
			{ cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } }
		)
		if (!existsSync(out)) {
			console.error(`lint-react-doctor: o doctor não gravou o relatório de ${app} (exit ${run.exitCode})\n${run.stderr.toString()}`)
			process.exit(1)
		}
		const report = JSON.parse(readFileSync(out, "utf8")) as Report
		// Varredura parcial (tempo esgotado, erro do doctor) contaria menos e passaria por melhora.
		if (!report.ok || report.projects.some((p) => p.complete === false)) {
			console.error(`lint-react-doctor: varredura incompleta de ${app}: ${JSON.stringify(report.error ?? "projeto incompleto")}`)
			process.exit(1)
		}
		return report.diagnostics
	} finally {
		rmSync(outDir, { recursive: true, force: true })
	}
}

/** Arquivos alterados desde a main (mesmo critério do lint-tailwind): o achado novo quase sempre está neles. */
let changed: Set<string> | undefined
function listChangedFiles(): Set<string> {
	if (changed) return changed
	const runGit = (...argv: string[]) => {
		const r = Bun.spawnSync(["git", "-c", "core.quotePath=false", ...argv], { cwd: ROOT, stdout: "pipe", stderr: "pipe" })
		return r.exitCode === 0 ? r.stdout.toString().split("\n").filter(Boolean) : []
	}
	const [base] = runGit("merge-base", "HEAD", "origin/main")
	changed = new Set([...(base ? runGit("diff", "--name-only", base) : []), ...runGit("ls-files", "--others", "--exclude-standard")])
	return changed
}

let failed = false
for (const app of apps) {
	const toRepoPath = (d: Diagnostic) => `apps/${app}/${d.filePath}`
	const formatDiagnostic = (d: Diagnostic) => `  ${toRepoPath(d)}:${d.line}:${d.column}  ${getRuleName(d)}  ${d.help?.startsWith("Todo:") ? d.help : d.message}`
	let appFailed = false
	const debt = scanApp(app).filter((d) => isRatcheted(getRuleName(d)))

	const counts: Counts = {}
	for (const d of debt) counts[getRuleName(d)] = (counts[getRuleName(d)] ?? 0) + 1
	const baselinePath = join(ROOT, "apps", app, BASELINE_FILE)

	if (update) {
		const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
		if (Object.keys(sorted).length === 0) rmSync(baselinePath, { force: true })
		// 2 espaços: é o que o Biome exige de JSON neste repo.
		else writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`)
		console.log(`${app}: baseline ${JSON.stringify(sorted)}`)
		continue
	}

	const baseline: Counts = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {}
	const stray = Object.keys(baseline).filter((rule) => !isRatcheted(rule))
	if (stray.length > 0) {
		console.error(`\n${app}: o baseline conta regra fora de RATCHETED_RULES (${stray.join(", ")}). Regrave: bun scripts/lint-react-doctor.ts ${app} --update`)
		appFailed = true
	}
	for (const rule of RATCHETED_RULES) {
		const found = counts[rule] ?? 0
		const allowed = baseline[rule] ?? 0
		if (found > allowed) {
			const all = debt.filter((d) => getRuleName(d) === rule)
			const touched = all.filter((d) => listChangedFiles().has(toRepoPath(d)))
			const [list, where] = touched.length >= found - allowed ? [touched, "nos arquivos alterados desde a main"] : [all, "em todo o app"]
			console.error(`\n${app}: ${rule} subiu de ${allowed} para ${found}. Corrija o que entrou (${where}):\n${list.map(formatDiagnostic).join("\n")}`)
			appFailed = true
		} else if (found < allowed) {
			console.error(`\n${app}: ${rule} desceu de ${allowed} para ${found}. Baixe o baseline: bun scripts/lint-react-doctor.ts ${app} --update`)
			appFailed = true
		}
	}
	if (appFailed) failed = true
	else console.log(`${app}: ok ${JSON.stringify(counts)}`)
}

process.exit(failed ? 1 : 0)
