#!/usr/bin/env bun
/**
 * Depois do merge: o PR chegou à produção? (AGENTS.md > Workflow, `.claude/rules/ci.md`)
 *
 *   bun scripts/watch-merge.ts <n>                          # estado agora
 *   bun scripts/watch-merge.ts <n> --wait [--timeout 120]   # espera (minutos)
 *
 * Lê o commit do merge, os runs dele na `main` e, no `CI/CD`, os jobs de cada app. Aplica as
 * leituras que o ci.md pede e que se erravam à mão:
 *   - check ou build vermelho deixa o deploy `skipped`, não `failed`: app com check/build
 *     verde e deploy `skipped` é bloqueio, não "nada a fazer"; tudo `skipped` é app sem mudança;
 *   - deploy `cancelled` é a fila do `ecs-deploy-<app>`: vale se um deploy posterior do mesmo
 *     app, de um commit que contém este, terminou verde;
 *   - a integração se lê pelo job `full suite (monitor)`, não pelo run (o job tem
 *     `continue-on-error`, e o run sai `success` com ele vermelho). `cancelled` no `gate` ou no
 *     `full` é commit mais novo na fila da trava: vale se um run posterior, de um commit que
 *     contém este, teve o `full` verde.
 *
 * Sai 0 quando tudo chegou, 1 quando algo está vermelho e 3 quando ainda falta (sem `--wait`,
 * ou com o tempo esgotado).
 */

export type Job = { name: string; conclusion: string | null; status: string }
export type AppState = "deployed" | "checked" | "unchanged" | "blocked" | "failed" | "superseded?" | "running"

const JOB_RE = /^(check|build|deploy)-([\w-]+?)(?: \/ .*)?$/
const BAD = new Set(["failure", "timed_out", "startup_failure", "action_required"])

/** Estado de cada app no run do CI/CD, a partir dos jobs `check-<app>`, `build-<app>` e `deploy-<app>`. */
export function classifyDeployJobs(jobs: readonly Job[]): Map<string, AppState> {
	const byApp = new Map<string, Partial<Record<"check" | "build" | "deploy", Job>>>()
	for (const job of jobs) {
		const match = JOB_RE.exec(job.name)
		if (!match) continue
		const [, stage, app] = match as unknown as [string, "check" | "build" | "deploy", string]
		byApp.set(app, { ...byApp.get(app), [stage]: job })
	}
	const states = new Map<string, AppState>()
	for (const [app, stages] of byApp) {
		const all = Object.values(stages)
		if (all.some((job) => job.status !== "completed")) states.set(app, "running")
		else if (all.some((job) => BAD.has(job.conclusion ?? ""))) states.set(app, "failed")
		// Fila do `ecs-deploy-<app>`: um deploy mais novo cancelou este. Quem decide é o posterior.
		else if (all.some((job) => job.conclusion === "cancelled")) states.set(app, "superseded?")
		else if (stages.deploy?.conclusion === "success") states.set(app, "deployed")
		// Só check (`check-packages`): não há o que publicar, vale o resultado do check.
		else if (!stages.build && !stages.deploy && stages.check?.conclusion === "success") states.set(app, "checked")
		else if (all.every((job) => job.conclusion === "skipped")) states.set(app, "unchanged")
		else states.set(app, "blocked")
	}
	return states
}

export type IntegrationState = "passed" | "not-applicable" | "failed" | "superseded?" | "running"

/** Veredito do `sisub integration (real db)` pelos jobs: o run sai `success` com o `full` vermelho. */
export function classifyIntegrationJobs(jobs: readonly Job[]): IntegrationState {
	const gate = jobs.find((job) => job.name.startsWith("gate"))
	const full = jobs.find((job) => job.name.startsWith("full"))
	if (jobs.some((job) => job.status !== "completed")) return "running"
	if (gate?.conclusion === "cancelled" || full?.conclusion === "cancelled") return "superseded?"
	if (BAD.has(gate?.conclusion ?? "") || BAD.has(full?.conclusion ?? "")) return "failed"
	if (full?.conclusion === "success") return "passed"
	if ((gate?.conclusion ?? "skipped") === "skipped" && (full?.conclusion ?? "skipped") === "skipped") return "not-applicable"
	return "failed"
}

type Run = { databaseId: number; workflowName: string; status: string; conclusion: string | null; headSha: string; createdAt: string; url: string }
const RUN_FIELDS = "databaseId,workflowName,status,conclusion,headSha,createdAt,url"
const INTEGRATION = "sisub integration (real db)"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** `gh` com JSON, tentando de novo erro transitório (502, limite secundário) antes de desistir. */
async function gh<T>(args: string[]): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		const proc = Bun.spawnSync(["gh", ...args], { stderr: "pipe" })
		if (proc.exitCode === 0) return JSON.parse(proc.stdout.toString()) as T
		if (attempt >= 4) throw new Error(`gh ${args.join(" ")}: ${proc.stderr.toString().trim()}`)
		await sleep(5_000 * attempt)
	}
}

const jobsOf = async (run: Run) => (await gh<{ jobs: Job[] }>(["run", "view", String(run.databaseId), "--json", "jobs"])).jobs

function fetchMain(): void {
	const fetch = Bun.spawnSync(["git", "fetch", "-q", "origin", "main"], { stderr: "pipe" })
	if (fetch.exitCode !== 0) throw new Error(`git fetch origin main: ${fetch.stderr.toString().trim()}`)
}
const contains = (newer: string, older: string) => Bun.spawnSync(["git", "merge-base", "--is-ancestor", older, newer]).exitCode === 0

/** Run posterior do mesmo workflow, de commit que contém `sha`, que cobre o que este não terminou. */
async function findCover(run: Run, sha: string, covers: (later: Run) => Promise<boolean>): Promise<Run | undefined> {
	const runs = await gh<Run[]>(["run", "list", "--workflow", run.workflowName, "--branch", "main", "--limit", "30", "--json", RUN_FIELDS])
	const later = runs.filter((other) => other.createdAt > run.createdAt && other.status === "completed" && contains(other.headSha, sha))
	for (const candidate of later) if (await covers(candidate)) return candidate
	return undefined
}

type Report = { lines: string[]; code: 0 | 1 | 3 }

async function inspect(sha: string): Promise<Report> {
	fetchMain()
	const runs = await gh<Run[]>(["run", "list", "--commit", sha, "--json", RUN_FIELDS])
	// O push acabou de acontecer e o GitHub ainda não registrou os runs: falta, não "tudo verde".
	if (!runs.some((run) => run.workflowName === "CI/CD")) return { lines: ["  CI/CD: ainda não registrado"], code: 3 }

	const lines: string[] = []
	let code: 0 | 1 | 3 = 0
	const raise = (next: 1 | 3) => {
		if (next === 1 || code === 0) code = next
	}

	for (const run of runs) {
		if (run.status !== "completed") {
			lines.push(`  ${run.workflowName}: ${run.status}  ${run.url}`)
			raise(3)
			continue
		}
		if (run.workflowName === INTEGRATION) {
			let state = classifyIntegrationJobs(await jobsOf(run))
			let note = ""
			if (state === "superseded?") {
				const cover = await findCover(run, sha, async (later) => classifyIntegrationJobs(await jobsOf(later)) === "passed")
				if (cover) {
					state = "passed"
					note = ` (cancelado na fila; coberto pelo full de ${cover.headSha.slice(0, 8)})`
				} else note = " (cancelado na fila; nenhum full posterior verde ainda)"
			}
			lines.push(`  ${run.workflowName}: ${state}${note}  ${run.url}`)
			if (state === "failed") raise(1)
			else if (state === "superseded?" || state === "running") raise(3)
			continue
		}
		lines.push(`  ${run.workflowName}: ${run.conclusion}  ${run.url}`)
		if (BAD.has(run.conclusion ?? "")) raise(1)
		if (run.workflowName !== "CI/CD") continue

		for (const [app, state] of classifyDeployJobs(await jobsOf(run))) {
			if (state === "unchanged") continue
			let shown: string = state
			if (state === "superseded?") {
				const cover = await findCover(run, sha, async (later) => classifyDeployJobs(await jobsOf(later)).get(app) === "deployed")
				shown = cover ? `deployed (pelo deploy de ${cover.headSha.slice(0, 8)})` : "cancelado na fila; nenhum deploy posterior verde ainda"
				if (!cover) raise(3)
			}
			lines.push(`    ${app}: ${shown}`)
			if (state === "failed" || state === "blocked") raise(1)
			else if (state === "running") raise(3)
		}
	}
	return { lines, code }
}

async function main(pr: string, wait: boolean, timeoutMin: number): Promise<number> {
	const deadline = Date.now() + timeoutMin * 60_000
	let view = await gh<{ state: string; mergeCommit: { oid: string } | null }>(["pr", "view", pr, "--json", "state,mergeCommit"])
	while (view.state !== "MERGED") {
		if (view.state === "CLOSED") {
			console.log(`PR ${pr} fechado sem merge.`)
			return 1
		}
		// Só os obrigatórios seguram o merge; CodeQL e Trivy só reportam.
		const required = await gh<Array<{ name: string; bucket: string }>>(["pr", "checks", pr, "--required", "--json", "name,bucket"])
		const failing = required.filter((check) => check.bucket === "fail")
		if (failing.length > 0) {
			console.log(`PR ${pr} com check obrigatório vermelho: ${failing.map((check) => check.name).join(", ")}`)
			return 1
		}
		if (!wait || Date.now() > deadline) {
			console.log(`PR ${pr} ainda não mergeado (${view.state}).`)
			return 3
		}
		await sleep(30_000)
		view = await gh(["pr", "view", pr, "--json", "state,mergeCommit"])
	}

	const sha = view.mergeCommit?.oid ?? ""
	console.log(`PR ${pr} mergeado em ${sha.slice(0, 8)}`)
	for (;;) {
		const report = await inspect(sha)
		if (report.code !== 3 || !wait || Date.now() > deadline) {
			for (const line of report.lines) console.log(line)
			if (report.code === 3 && wait) console.log(`Tempo esgotado (${timeoutMin} min) com etapa pendente.`)
			return report.code
		}
		await sleep(30_000)
	}
}

/** `<n> [--wait] [--timeout <min>]`, em qualquer ordem. */
export function parseArgs(argv: readonly string[]): { pr: string | undefined; wait: boolean; timeoutMin: number } {
	let pr: string | undefined
	let wait = false
	let timeoutMin = 120
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--wait") wait = true
		else if (argv[i] === "--timeout") timeoutMin = Number(argv[++i])
		else pr ??= argv[i]
	}
	return { pr, wait, timeoutMin }
}

if (import.meta.main) {
	const { pr, wait, timeoutMin } = parseArgs(process.argv.slice(2))
	if (!pr || !Number.isFinite(timeoutMin)) {
		console.error("uso: bun scripts/watch-merge.ts <n> [--wait] [--timeout <minutos>]")
		process.exit(64)
	}
	process.exit(await main(pr, wait, timeoutMin))
}
