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
 *   - a integração se lê pelos jobs `gate` e `full suite (monitor)`, não pelo run (o `full` tem
 *     `continue-on-error`, e o run sai `success` com ele vermelho);
 *   - `cancelled` (deploy na fila `ecs-deploy-<app>`, integração na trava, `security` com
 *     `cancel-in-progress`) só é "fila" se houver run posterior, de um commit que contém este,
 *     que rodou a mesma etapa: o veredito é o dele, verde ou vermelho. Sem run posterior, foi
 *     timeout ou cancelamento à mão, e conta como vermelho.
 *
 * Sai 0 quando tudo chegou, 1 com algo vermelho, 3 quando ainda falta (sem `--wait`, ou com o
 * tempo esgotado) e 4 quando a própria verificação falhou (gh, git): aí não se sabe o estado.
 */

export type Job = { name: string; conclusion: string | null; status: string }
export type AppState = "deployed" | "checked" | "unchanged" | "blocked" | "failed" | "cancelled" | "running"

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
		else if (all.some((job) => job.conclusion === "cancelled")) states.set(app, "cancelled")
		else if (stages.deploy?.conclusion === "success") states.set(app, "deployed")
		// Só check (`check-packages`): não há o que publicar, vale o resultado do check.
		else if (!stages.build && !stages.deploy && stages.check?.conclusion === "success") states.set(app, "checked")
		else if (all.every((job) => job.conclusion === "skipped")) states.set(app, "unchanged")
		else states.set(app, "blocked")
	}
	return states
}

export type IntegrationState = "passed" | "not-applicable" | "failed" | "cancelled" | "running"

/** Veredito do `sisub integration (real db)` pelos jobs: o run sai `success` com o `full` vermelho. */
export function classifyIntegrationJobs(jobs: readonly Job[]): IntegrationState {
	const gate = jobs.find((job) => job.name.startsWith("gate"))
	const full = jobs.find((job) => job.name.startsWith("full"))
	if (jobs.some((job) => job.status !== "completed")) return "running"
	if (BAD.has(gate?.conclusion ?? "") || BAD.has(full?.conclusion ?? "")) return "failed"
	if (gate?.conclusion === "cancelled" || full?.conclusion === "cancelled") return "cancelled"
	if (full?.conclusion === "success") return "passed"
	if ((gate?.conclusion ?? "skipped") === "skipped" && (full?.conclusion ?? "skipped") === "skipped") return "not-applicable"
	return "failed"
}

/** Etapa de um run: verde, vermelha, cancelada, rodando, ou não rodada nele (não cobre nada). */
export type StageVerdict = "passed" | "failed" | "cancelled" | "running" | "absent"

/**
 * Veredito de uma etapa cancelada pelos runs posteriores (mais antigo primeiro), já filtrados
 * para commits que contêm o dela: o primeiro que terminou a etapa decide, verde ou vermelho; um
 * que ainda roda deixa pendente. Run que não rodou a etapa (o commit dele não tocou o app) não
 * cobre nada. Se nenhum posterior a terminou, o cancelamento não foi fila (foi timeout ou à
 * mão): `failed`.
 */
export function resolveCancelled(later: readonly StageVerdict[]): "passed" | "failed" | "running" {
	for (const verdict of later) {
		if (verdict === "passed" || verdict === "failed" || verdict === "running") return verdict
	}
	return "failed"
}

type Run = { databaseId: number; workflowName: string; status: string; conclusion: string | null; headSha: string; createdAt: string; url: string }
const RUN_FIELDS = "databaseId,workflowName,status,conclusion,headSha,createdAt,url"
const INTEGRATION = "sisub integration (real db)"
const TRANSIENT = /\b(50[234]|429|rate limit|timed? ?out|ECONNRESET|EAI_AGAIN|connection reset)\b/i

class ToolError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** `gh` com JSON. Tenta de novo só erro transitório (5xx, limite, rede); o resto falha na hora. */
async function gh<T>(args: string[]): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		const proc = Bun.spawnSync(["gh", ...args], { stderr: "pipe" })
		if (proc.exitCode === 0) return JSON.parse(proc.stdout.toString()) as T
		const stderr = proc.stderr.toString().trim()
		if (attempt >= 4 || !TRANSIENT.test(stderr)) throw new ToolError(`gh ${args.join(" ")}: ${stderr}`)
		await sleep(5_000 * attempt)
	}
}

async function fetchMain(): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		const proc = Bun.spawnSync(["git", "fetch", "-q", "origin", "main"], { stderr: "pipe" })
		if (proc.exitCode === 0) return
		if (attempt >= 3) throw new ToolError(`git fetch origin main: ${proc.stderr.toString().trim()}`)
		await sleep(5_000 * attempt)
	}
}

const hasCommit = (newer: string, older: string) => Bun.spawnSync(["git", "merge-base", "--is-ancestor", older, newer]).exitCode === 0

/** Uma passada: jobs e listas de run em cache, para não repetir chamada por app. */
class Pass {
	private jobs = new Map<number, Job[]>()
	private lists = new Map<string, Run[]>()

	async fetchJobs(run: Run): Promise<Job[]> {
		const cached = this.jobs.get(run.databaseId)
		if (cached) return cached
		const { jobs } = await gh<{ jobs: Job[] }>(["run", "view", String(run.databaseId), "--json", "jobs"])
		this.jobs.set(run.databaseId, jobs)
		return jobs
	}

	/** Runs posteriores do mesmo workflow na main, de commits que contêm `sha`, do mais antigo ao mais novo. */
	async listLaterRuns(run: Run, sha: string): Promise<Run[]> {
		let runs = this.lists.get(run.workflowName)
		if (!runs) {
			runs = await gh<Run[]>(["run", "list", "--workflow", run.workflowName, "--branch", "main", "--limit", "30", "--json", RUN_FIELDS])
			this.lists.set(run.workflowName, runs)
		}
		return runs.filter((other) => other.createdAt > run.createdAt && hasCommit(other.headSha, sha)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
	}

	async resolve(run: Run, sha: string, stageOf: (jobs: Job[], later: Run) => StageVerdict): Promise<"passed" | "failed" | "running"> {
		const verdicts: StageVerdict[] = []
		for (const later of await this.listLaterRuns(run, sha)) {
			verdicts.push(later.status === "completed" ? stageOf(await this.fetchJobs(later), later) : "running")
		}
		return resolveCancelled(verdicts)
	}
}

const fromIntegration = (state: IntegrationState): StageVerdict =>
	state === "passed" ? "passed" : state === "failed" ? "failed" : state === "cancelled" ? "cancelled" : state === "running" ? "running" : "absent"

const fromApp = (state: AppState | undefined): StageVerdict =>
	state === "deployed" || state === "checked"
		? "passed"
		: state === "failed" || state === "blocked"
			? "failed"
			: state === "cancelled"
				? "cancelled"
				: state === "running"
					? "running"
					: "absent"

type Report = { lines: string[]; code: 0 | 1 | 3 }

async function inspect(sha: string): Promise<Report> {
	await fetchMain()
	const pass = new Pass()
	const runs = await gh<Run[]>(["run", "list", "--commit", sha, "--json", RUN_FIELDS])
	// O push acabou de acontecer e o GitHub ainda não registrou os runs: falta, não "tudo verde".
	if (!runs.some((run) => run.workflowName === "CI/CD")) return { lines: ["  CI/CD: ainda não registrado"], code: 3 }

	const lines: string[] = []
	let code: 0 | 1 | 3 = 0
	const note = (verdict: "passed" | "failed" | "running") => {
		if (verdict === "failed") code = 1
		else if (verdict === "running" && code === 0) code = 3
	}
	const coverText = (verdict: "passed" | "failed" | "running") =>
		verdict === "passed"
			? "cancelado na fila; run posterior verde"
			: verdict === "failed"
				? "cancelado; run posterior vermelho, ou nenhum (timeout?)"
				: "cancelado na fila; run posterior ainda roda"

	for (const run of runs) {
		if (run.status !== "completed") {
			lines.push(`  ${run.workflowName}: ${run.status}  ${run.url}`)
			note("running")
			continue
		}
		if (run.workflowName === INTEGRATION) {
			const state = classifyIntegrationJobs(await pass.fetchJobs(run))
			if (state === "cancelled") {
				const verdict = await pass.resolve(run, sha, (jobs) => fromIntegration(classifyIntegrationJobs(jobs)))
				lines.push(`  ${run.workflowName}: ${coverText(verdict)}  ${run.url}`)
				note(verdict)
			} else {
				lines.push(`  ${run.workflowName}: ${state}  ${run.url}`)
				note(state === "failed" ? "failed" : state === "running" ? "running" : "passed")
			}
			continue
		}
		if (run.workflowName !== "CI/CD") {
			if (run.conclusion === "cancelled") {
				const verdict = await pass.resolve(run, sha, (_jobs, later) =>
					later.conclusion === "success" ? "passed" : later.conclusion === "cancelled" ? "cancelled" : "failed"
				)
				lines.push(`  ${run.workflowName}: ${coverText(verdict)}  ${run.url}`)
				note(verdict)
			} else {
				lines.push(`  ${run.workflowName}: ${run.conclusion}  ${run.url}`)
				if (run.conclusion !== "success" && run.conclusion !== "skipped") note("failed")
			}
			continue
		}

		lines.push(`  ${run.workflowName}: ${run.conclusion}  ${run.url}`)
		for (const [app, state] of classifyDeployJobs(await pass.fetchJobs(run))) {
			if (state === "unchanged") continue
			if (state === "cancelled") {
				const verdict = await pass.resolve(run, sha, (jobs) => fromApp(classifyDeployJobs(jobs).get(app)))
				lines.push(`    ${app}: ${coverText(verdict)}`)
				note(verdict)
				continue
			}
			lines.push(`    ${app}: ${state}`)
			note(fromApp(state) === "passed" ? "passed" : state === "running" ? "running" : "failed")
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
	try {
		process.exit(await main(pr, wait, timeoutMin))
	} catch (error) {
		// Falha da verificação não é "vermelho": o estado do deploy ficou desconhecido.
		if (!(error instanceof ToolError)) throw error
		console.error(`verificação interrompida: ${error.message}`)
		process.exit(4)
	}
}
