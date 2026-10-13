#!/usr/bin/env bun
/**
 * Job `plan` do deploy.yml: quais apps este run publica.
 *
 * - push na `main`: os filtros do `.github/paths-filter.yml` que casaram (`CHANGED`, a saída
 *   `changes` do dorny/paths-filter, em JSON);
 * - workflow_dispatch: o input `apps` (`DISPATCH_APPS`), `all` ou chaves separadas por vírgula.
 *
 * Escreve no `$GITHUB_OUTPUT`: `apps` (chaves, em JSON, para o `verify`) e `monorepo` (`true` se
 * algum app sai do Dockerfile raiz, para o `warm-deps`).
 */
import { appendFileSync } from "node:fs"
import { type App, buildSourceOf, filterKeyOf, manifest } from "./generate-deploy-artifacts"

export type Plan = { apps: string[]; monorepo: boolean }

/** Chaves do manifesto, na ordem dele, a partir dos filtros que casaram ou do input do dispatch. */
export function resolveApps(input: { event: string; changed?: string; dispatch?: string }, apps: readonly App[] = manifest.apps): string[] {
	if (input.event === "workflow_dispatch") {
		const raw = (input.dispatch ?? "").trim()
		if (raw === "all") return apps.map((app) => app.key)
		const wanted = raw
			.split(",")
			.map((key) => key.trim())
			.filter(Boolean)
		const unknown = wanted.filter((key) => !apps.some((app) => app.key === key))
		if (unknown.length) throw new Error(`app desconhecido no input \`apps\`: ${unknown.join(", ")} (chaves: ${apps.map((a) => a.key).join(", ")})`)
		return apps.filter((app) => wanted.includes(app.key)).map((app) => app.key)
	}
	const filters = new Set<string>(JSON.parse(input.changed || "[]"))
	return apps.filter((app) => filters.has(filterKeyOf(app))).map((app) => app.key)
}

export function planOf(keys: readonly string[], apps: readonly App[] = manifest.apps): Plan {
	const selected = apps.filter((app) => keys.includes(app.key))
	const monorepo = selected.some((app) => app.release !== "static-site" && buildSourceOf(app).kind !== "dockerfile")
	return { apps: [...keys], monorepo }
}

if (import.meta.main) {
	// Variáveis do job do GitHub Actions, não do turbo.
	const { EVENT_NAME, CHANGED, DISPATCH_APPS, GITHUB_OUTPUT } = Bun.env
	const plan = planOf(resolveApps({ event: EVENT_NAME ?? "", changed: CHANGED, dispatch: DISPATCH_APPS }))
	console.log(`apps: ${plan.apps.join(", ") || "(nenhum)"}; warm-deps: ${plan.monorepo}`)
	if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `apps=${JSON.stringify(plan.apps)}\nmonorepo=${plan.monorepo}\n`)
}
