#!/usr/bin/env bun
/**
 * Depois do merge: o PR chegou à produção? (AGENTS.md > Workflow, `.claude/rules/ci.md`)
 *
 *   bun scripts/watch-merge.ts <n>          # estado agora
 *   bun scripts/watch-merge.ts <n> --wait   # espera o merge e os runs da main terminarem
 *
 * Lê o commit do merge, os runs dele na `main` e, no `CI/CD`, os jobs de cada app. Aplica as
 * leituras que o ci.md pede e que se erravam à mão:
 *   - check ou build vermelho deixa o deploy `skipped`, não `failed`: app com check/build
 *     verde e deploy `skipped` é bloqueio, não "nada a fazer";
 *   - app com tudo `skipped` não mudou;
 *   - `cancelled` no `sisub integration (real db)` da main é commit mais novo na fila da
 *     trava: só vale se um run posterior, de um commit que contém este, passou.
 *
 * Sai 0 quando tudo chegou, 1 quando algo está vermelho e 3 quando ainda roda (sem --wait).
 */

export type Job = { name: string; conclusion: string | null; status: string }
export type AppState = "deployed" | "checked" | "unchanged" | "blocked" | "failed" | "running"

const JOB_RE = /^(check|build|deploy)-([\w-]+?)(?: \/ .*)?$/

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
		else if (all.some((job) => job.conclusion === "failure" || job.conclusion === "cancelled" || job.conclusion === "timed_out")) states.set(app, "failed")
		else if (stages.deploy?.conclusion === "success") states.set(app, "deployed")
		// Só check (`check-packages`): não há o que publicar, vale o resultado do check.
		else if (!stages.build && !stages.deploy && stages.check?.conclusion === "success") states.set(app, "checked")
		else if (all.every((job) => job.conclusion === "skipped")) states.set(app, "unchanged")
		else states.set(app, "blocked")
	}
	return states
}

type Run = { databaseId: number; workflowName: string; status: string; conclusion: string | null; headSha: string; createdAt: string; url: string }

function gh<T>(args: string[]): T {
	const proc = Bun.spawnSync(["gh", ...args], { stderr: "pipe" })
	if (proc.exitCode !== 0) throw new Error(`gh ${args.join(" ")}: ${proc.stderr.toString().trim()}`)
	return JSON.parse(proc.stdout.toString()) as T
}

function isAncestor(older: string, newer: string): boolean {
	Bun.spawnSync(["git", "fetch", "-q", "origin", "main"])
	return Bun.spawnSync(["git", "merge-base", "--is-ancestor", older, newer]).exitCode === 0
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main(pr: string, wait: boolean): Promise<number> {
	let view = gh<{ state: string; mergeCommit: { oid: string } | null; url: string }>(["pr", "view", pr, "--json", "state,mergeCommit,url"])
	while (view.state !== "MERGED") {
		if (view.state === "CLOSED") {
			console.log(`PR ${pr} fechado sem merge.`)
			return 1
		}
		const failing = gh<Array<{ name: string; bucket: string }>>(["pr", "checks", pr, "--json", "name,bucket"]).filter((c) => c.bucket === "fail")
		if (failing.length > 0) {
			console.log(`PR ${pr} com check vermelho: ${failing.map((c) => c.name).join(", ")}`)
			return 1
		}
		if (!wait) {
			console.log(`PR ${pr} ainda não mergeado (${view.state}).`)
			return 3
		}
		await sleep(30_000)
		view = gh(["pr", "view", pr, "--json", "state,mergeCommit,url"])
	}
	const sha = view.mergeCommit?.oid ?? ""
	console.log(`PR ${pr} mergeado em ${sha.slice(0, 8)}`)

	let runs: Run[] = []
	for (;;) {
		runs = gh<Run[]>(["run", "list", "--commit", sha, "--json", "databaseId,workflowName,status,conclusion,headSha,createdAt,url"])
		const pending = runs.length === 0 || runs.some((run) => run.status !== "completed")
		if (!pending || !wait) break
		await sleep(30_000)
	}

	let code = 0
	for (const run of runs) {
		let verdict = run.status === "completed" ? (run.conclusion ?? "?") : run.status
		if (run.workflowName === "sisub integration (real db)" && run.conclusion === "cancelled") {
			const later = gh<Run[]>([
				"run",
				"list",
				"--workflow",
				run.workflowName,
				"--branch",
				"main",
				"--limit",
				"20",
				"--json",
				"databaseId,workflowName,status,conclusion,headSha,createdAt,url",
			])
				.filter((other) => other.createdAt > run.createdAt && other.status === "completed" && other.conclusion === "success")
				.find((other) => isAncestor(sha, other.headSha))
			verdict = later ? `cancelled, coberto por ${later.headSha.slice(0, 8)} (success)` : "cancelled, sem run posterior verde ainda"
			if (!later) code = Math.max(code, wait ? 1 : 3)
		} else if (run.status !== "completed") code = Math.max(code, 3)
		else if (run.conclusion !== "success" && run.conclusion !== "skipped") code = 1
		console.log(`  ${run.workflowName}: ${verdict}  ${run.url}`)

		if (run.workflowName === "CI/CD" && run.status === "completed") {
			const { jobs } = gh<{ jobs: Job[] }>(["run", "view", String(run.databaseId), "--json", "jobs"])
			for (const [app, state] of classifyDeployJobs(jobs)) {
				if (state === "unchanged") continue
				console.log(`    ${app}: ${state}`)
				if (state === "failed" || state === "blocked") code = 1
			}
		}
	}
	return code
}

if (import.meta.main) {
	const pr = process.argv[2]
	if (!pr) {
		console.error("uso: bun scripts/watch-merge.ts <n> [--wait]")
		process.exit(64)
	}
	process.exit(await main(pr, process.argv.includes("--wait")))
}
