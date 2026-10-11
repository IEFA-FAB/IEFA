#!/usr/bin/env bun
/**
 * Job `verify` do deploy.yml: o lint, typecheck e teste do resultado do merge, num job só.
 *
 * Antes eram 13 jobs `check-<app>`, cada um com checkout e `bun install` próprios, quase todos
 * de segundos e cobrados como minuto cheio. Agora uma invocação do turbo roda as tarefas de todos
 * os apps do plano (`APPS`, em JSON) e os testes de todo package, em paralelo e com o grafo
 * compartilhado, e o resumo do turbo (`--summarize`) diz quais tarefas passaram.
 *
 * O resultado continua por app: um app vermelho não segura o deploy dos outros. Escreve no
 * `$GITHUB_OUTPUT` `release` (a matriz do job `release`: os apps do ECS que passaram) e `docs`
 * (`true` se o site estático passou), e no resumo do job uma tabela por app. Sai com 1 se
 * qualquer app ou package falhou, para o run ficar vermelho; os outputs já estão escritos.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { type App, bakeSecretsOf, buildSourceOf, manifest } from "./generate-deploy-artifacts"

const ROOT = join(import.meta.dir, "..")
const DEFAULT_TASKS = ["lint", "typecheck", "test"]

/** Os testes que não pertencem a app nenhum. Rodam em todo push: o guard do inventário de cookies
 * de um package varre `apps/*`, e um app novo é justamente o que o quebra. */
export const PACKAGES = "packages"

/** Tarefas de turbo (`<workspace>#<tarefa>`) que liberam o app. */
export function checkTasksOf(app: App): string[] {
	if (app.check) return app.check
	const source = buildSourceOf(app)
	if (source.check) return source.check
	if (source.kind === "dockerfile" || !source.workspace) return []
	return DEFAULT_TASKS.map((task) => `${source.workspace}#${task}`)
}

export type Workspace = { name: string; scripts: Record<string, string>; dir: string }

export function readWorkspaces(): Workspace[] {
	const out: Workspace[] = []
	for (const base of ["apps", "packages"]) {
		for (const dir of readdirSync(join(ROOT, base))) {
			const file = join(ROOT, base, dir, "package.json")
			if (!existsSync(file)) continue
			const pkg = JSON.parse(readFileSync(file, "utf8")) as { name: string; scripts?: Record<string, string> }
			out.push({ name: pkg.name, scripts: pkg.scripts ?? {}, dir: `${base}/${dir}` })
		}
	}
	return out
}

/** Grupos a checar (cada app do plano e os packages) e as tarefas de cada um. Tarefa que o
 * workspace não declara é erro de configuração no manifesto, não verde. */
export function groupsOf(keys: readonly string[], workspaces: readonly Workspace[], apps: readonly App[] = manifest.apps): Map<string, string[]> {
	const groups = new Map<string, string[]>()
	for (const key of keys) {
		const app = apps.find((a) => a.key === key)
		if (!app) throw new Error(`app desconhecido: ${key}`)
		groups.set(key, checkTasksOf(app))
	}
	groups.set(
		PACKAGES,
		workspaces.filter((ws) => ws.dir.startsWith("packages/") && ws.scripts.test).map((ws) => `${ws.name}#test`)
	)
	const missing = [...groups.values()].flat().filter((id) => {
		const [name, task] = splitTask(id)
		return !workspaces.some((ws) => ws.name === name && ws.scripts[task])
	})
	if (missing.length) throw new Error(`tarefa sem script no workspace: ${[...new Set(missing)].join(", ")}`)
	return groups
}

function splitTask(id: string): [string, string] {
	const at = id.lastIndexOf("#")
	return [id.slice(0, at), id.slice(at + 1)]
}

export type Outcome = { group: string; ok: boolean; failed: string[] }

/** Resultado por grupo. Tarefa ausente do resumo não rodou (dependência falhou): conta como falha. */
export function outcomesOf(groups: Map<string, string[]>, exitCodes: Map<string, number>): Outcome[] {
	return [...groups].map(([group, tasks]) => {
		const failed = tasks.filter((id) => exitCodes.get(id) !== 0)
		return { group, ok: failed.length === 0, failed }
	})
}

export type ReleaseEntry = { key: string; health_var: string; build_timeout: number; attempt_timeout: number; build_secrets: string[] }

export function releaseEntriesOf(outcomes: readonly Outcome[], apps: readonly App[] = manifest.apps): ReleaseEntry[] {
	const passed = new Set(outcomes.filter((o) => o.ok).map((o) => o.group))
	return apps
		.filter((app) => passed.has(app.key) && app.release !== "static-site")
		.map((app) => ({
			key: app.key,
			health_var: app.healthUrlVar ?? "",
			build_timeout: app.buildTimeoutMinutes ?? 15,
			attempt_timeout: app.bakeAttemptTimeoutMinutes ?? 8,
			build_secrets: bakeSecretsOf(app),
		}))
}

function latestSummary(since: number): string {
	const dir = join(ROOT, ".turbo/runs")
	const files = existsSync(dir)
		? readdirSync(dir)
				.filter((f) => f.endsWith(".json"))
				.map((f) => join(dir, f))
				.filter((f) => statSync(f).mtimeMs >= since)
		: []
	files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
	const latest = files[0]
	if (!latest) throw new Error("o turbo não gravou o resumo do run (.turbo/runs)")
	return latest
}

if (import.meta.main) {
	// Variáveis do job do GitHub Actions, não do turbo.
	const { APPS, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = Bun.env
	const keys = JSON.parse(APPS || "[]") as string[]
	const groups = groupsOf(keys, readWorkspaces())
	const tasks = [...new Set([...groups.values()].flat())]
	const exitCodes = new Map<string, number>()
	if (tasks.length) {
		const started = Date.now()
		const run = Bun.spawnSync(["bunx", "turbo", "run", ...tasks, "--continue", "--concurrency=4", "--summarize"], {
			cwd: ROOT,
			stdio: ["inherit", "inherit", "inherit"],
		})
		console.log(`turbo saiu com ${run.exitCode}`)
		const summary = JSON.parse(readFileSync(latestSummary(started), "utf8")) as { tasks: { taskId: string; execution?: { exitCode?: number } }[] }
		for (const t of summary.tasks) if (typeof t.execution?.exitCode === "number") exitCodes.set(t.taskId, t.execution.exitCode)
	}
	const outcomes = outcomesOf(groups, exitCodes)
	const release = releaseEntriesOf(outcomes)
	const docs = outcomes.some((o) => o.ok && manifest.apps.find((a) => a.key === o.group)?.release === "static-site")

	const rows = outcomes.map((o) => `| ${o.group} | ${o.ok ? "✅" : "❌"} | ${o.failed.map((id) => `\`${id}\``).join(", ")} |`)
	const table = ["| Grupo | Resultado | Tarefas que falharam |", "|---|---|---|", ...rows].join("\n")
	console.log(table)
	if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `## verify\n\n${table}\n`)
	if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `release=${JSON.stringify(release)}\ndocs=${docs}\n`)
	if (outcomes.some((o) => !o.ok)) process.exit(1)
}
