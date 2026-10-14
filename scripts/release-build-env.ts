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
 * repo (role ARN, registry). O que o script garante é a lista: variável de origem que o manifesto
 * usa e o passo não declara falha o job, em vez de sair vazia em silêncio (foi assim que o
 * `VITE_SUCONT_*` ficou de fora do pr-check). Declarada e vazia (PR de fork) só avisa.
 */
import { appendFileSync } from "node:fs"
import { type App, manifest } from "./generate-deploy-artifacts"

export type BuildEnv = { env: Record<string, string>; missing: string[] }

export function buildEnvOf(app: App, vars: Record<string, string | undefined>): BuildEnv {
	const env: Record<string, string> = {}
	const missing: string[] = []
	for (const arg of app.buildArgs ?? []) {
		const from = app.buildArgFrom?.[arg] ?? arg
		const value = vars[from] ?? ""
		if (/[\r\n]/.test(value)) throw new Error(`a variável ${from} tem quebra de linha`)
		if (!value && !(app.optionalBuildArgs ?? []).includes(arg)) missing.push(from === arg ? arg : `${arg} (da variável ${from})`)
		env[arg] = value
	}
	return { env, missing }
}

/** Build arg → GitHub Variable de origem, de todos os apps. Dois apps lendo o mesmo build arg de origens diferentes é erro. */
export function buildArgSourcesOf(apps: App[]): Map<string, string> {
	const sources = new Map<string, string>()
	for (const app of apps) {
		for (const arg of app.buildArgs ?? []) {
			const from = app.buildArgFrom?.[arg] ?? arg
			const previous = sources.get(arg)
			if (previous !== undefined && previous !== from) throw new Error(`${arg} vem de ${previous} num app e de ${from} em ${app.key}`)
			sources.set(arg, from)
		}
	}
	return sources
}

export type AllBuildEnv = { env: Record<string, string>; undeclared: string[]; empty: string[] }

/** `--all`: `vars` é o ambiente do passo; variável ausente (`undefined`) é a que o workflow não declarou. */
export function allBuildEnvOf(apps: App[], vars: Record<string, string | undefined>): AllBuildEnv {
	const env: Record<string, string> = {}
	const undeclared = new Set<string>()
	const empty = new Set<string>()
	for (const [arg, from] of buildArgSourcesOf(apps)) {
		const value = vars[from]
		if (value === undefined) {
			undeclared.add(from)
			continue
		}
		if (/[\r\n]/.test(value)) throw new Error(`a variável ${from} tem quebra de linha`)
		if (!value) empty.add(from)
		env[arg] = value
	}
	return { env, undeclared: [...undeclared].sort(), empty: [...empty].sort() }
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
		const { env, undeclared, empty } = allBuildEnvOf(manifest.apps, Bun.env)
		if (undeclared.length) {
			console.error(`::error::declare no env: do passo "Resolve build args" do pr-check.yml (\${{ vars.X }}): ${undeclared.join(", ")}`)
			process.exit(1)
		}
		if (empty.length) console.log(`::notice::GitHub Variable vazia (PR de fork?); o build do PR sai sem ela: ${empty.join(", ")}`)
		console.log(`build args de todos os apps: ${Object.keys(env).sort().join(", ")}`)
		appendToGithubEnv(env)
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
