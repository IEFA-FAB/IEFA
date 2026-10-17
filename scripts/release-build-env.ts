#!/usr/bin/env bun
/**
 * Passo "Resolve build args" do `_release.yml`: os build args do app (`SERVICE`) a partir das
 * GitHub Variables (`VARS_JSON`, o `toJSON(vars)` do job), escritos no `$GITHUB_ENV`. O
 * docker-bake.hcl declara cada build arg como `variable`, e o bake lê a variável de ambiente
 * homônima.
 *
 * A lista vem do `buildArgs` do manifesto, e a variável de origem do `buildArgFrom` (rumaer,
 * sucont e assignment-selection usam as do sisub), então app novo não edita o workflow. Build arg
 * vazio falha aqui, antes do bake: o bake aceitaria `""` e publicaria um bundle sem a URL do
 * Supabase. Os do `optionalBuildArgs` (o Faro desligado vira no-op) podem sair vazios.
 *
 * `--all`: passo "Resolve build args" do `pr-check.yml`. Escreve no `$GITHUB_ENV` os build args de
 * todos os apps, para o `turbo run build` do PR buildar o mesmo bundle que o bake de produção. As
 * variáveis de origem chegam pelo `env:` do passo, uma a uma (`${{ vars.X }}`), e não por
 * `toJSON(vars)`: o pr-check roda código de PR de fork, que não deve ver todas as variáveis do
 * repo (role ARN, registry). Falha, como o `_release.yml`: variável que o manifesto usa e o passo
 * não declara (foi assim que o `VITE_SUCONT_*` ficou de fora do pr-check) e variável obrigatória
 * para algum app que chega vazia. Em PR de fork (`HEAD_REPO_FORK=true`) a vazia só avisa. O que
 * resolveu vai para o `$GITHUB_ENV` antes da falha, para os passos seguintes terem o que houver.
 */
import { appendFileSync } from "node:fs"
import { type App, manifest } from "./generate-deploy-artifacts"

export type BuildEnv = { env: Record<string, string>; missing: string[] }

/** GitHub Variable de onde sai o build arg: a indicada em `buildArgFrom`, ou a de mesmo nome. */
export function sourceOf(app: App, arg: string): string {
	return app.buildArgFrom?.[arg] ?? arg
}

function isOptional(app: App, arg: string): boolean {
	return (app.optionalBuildArgs ?? []).includes(arg)
}

/** Valor com quebra de linha injetaria outra variável no `$GITHUB_ENV`. */
function assertSingleLine(from: string, value: string): string {
	if (/[\r\n]/.test(value)) throw new Error(`a variável ${from} tem quebra de linha`)
	return value
}

export function buildEnvOf(app: App, vars: Record<string, string | undefined>): BuildEnv {
	const env: Record<string, string> = {}
	const missing: string[] = []
	for (const arg of app.buildArgs ?? []) {
		const from = sourceOf(app, arg)
		const value = assertSingleLine(from, vars[from] ?? "")
		if (!value && !isOptional(app, arg)) missing.push(from === arg ? arg : `${arg} (da variável ${from})`)
		env[arg] = value
	}
	return { env, missing }
}

export type BuildArgSource = { from: string; required: boolean }

/**
 * Build arg → variável de origem, de todos os apps; obrigatório se algum app que o usa não o tem em
 * `optionalBuildArgs`. Dois apps lendo o mesmo build arg de origens diferentes é erro.
 */
export function buildArgSourcesOf(apps: App[]): Map<string, BuildArgSource> {
	const sources = new Map<string, BuildArgSource>()
	for (const app of apps) {
		for (const arg of app.buildArgs ?? []) {
			const from = sourceOf(app, arg)
			const previous = sources.get(arg)
			if (previous && previous.from !== from) throw new Error(`${arg} vem de ${previous.from} num app e de ${from} em ${app.key}`)
			sources.set(arg, { from, required: (previous?.required ?? false) || !isOptional(app, arg) })
		}
	}
	return sources
}

export type AllBuildEnv = { env: Record<string, string>; undeclared: string[]; missing: string[] }

/**
 * `--all`: `vars` é o ambiente do passo. `undeclared`: variável que o workflow não declarou
 * (`undefined`). `missing`: obrigatória para algum app e vazia.
 */
export function allBuildEnvOf(apps: App[], vars: Record<string, string | undefined>): AllBuildEnv {
	const env: Record<string, string> = {}
	const undeclared = new Set<string>()
	const missing = new Set<string>()
	for (const [arg, { from, required }] of buildArgSourcesOf(apps)) {
		const value = vars[from]
		if (value === undefined) {
			undeclared.add(from)
			continue
		}
		env[arg] = assertSingleLine(from, value)
		if (!value && required) missing.add(from)
	}
	return { env, undeclared: [...undeclared].sort(), missing: [...missing].sort() }
}

function appendToGithubEnv(env: Record<string, string>) {
	// Variável do job do GitHub Actions, não do turbo.
	const { GITHUB_ENV } = Bun.env
	if (!GITHUB_ENV) return
	appendFileSync(
		GITHUB_ENV,
		Object.entries(env)
			.map(([k, v]) => `${k}=${v}\n`)
			.join("")
	)
}

if (import.meta.main) {
	if (process.argv.includes("--all")) {
		// Variável do job do GitHub Actions (`github.event.pull_request.head.repo.fork`), não do turbo.
		const { HEAD_REPO_FORK } = Bun.env
		const isFork = HEAD_REPO_FORK === "true"
		const { env, undeclared, missing } = allBuildEnvOf(manifest.apps, Bun.env)
		console.log(`build args de todos os apps: ${Object.keys(env).sort().join(", ")}`)
		appendToGithubEnv(env)
		let failed = false
		if (undeclared.length) {
			console.error(`::error::declare no env: do passo "Resolve build args" do pr-check.yml (\${{ vars.X }}): ${undeclared.join(", ")}`)
			failed = true
		}
		if (missing.length && isFork) {
			console.log(`::notice::PR de fork sem GitHub Variable obrigatória; o build do PR sai sem ela: ${missing.join(", ")}`)
		} else if (missing.length) {
			console.error(`::error::GitHub Variable obrigatória vazia (o build de produção também falharia): ${missing.join(", ")}`)
			failed = true
		}
		if (failed) process.exit(1)
	} else {
		// Variáveis do job do GitHub Actions, não do turbo.
		const { SERVICE, VARS_JSON } = Bun.env
		const app = manifest.apps.find((a) => a.key === SERVICE)
		if (!app) throw new Error(`app desconhecido: ${SERVICE}`)
		const { env, missing } = buildEnvOf(app, JSON.parse(VARS_JSON || "{}"))
		if (missing.length) {
			console.error(`::error::GitHub Variable vazia para o build de ${app.key}: ${missing.join(", ")}`)
			process.exit(1)
		}
		console.log(`build args de ${app.key}: ${Object.keys(env).join(", ") || "(nenhum)"}`)
		appendToGithubEnv(env)
	}
}
