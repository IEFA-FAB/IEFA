#!/usr/bin/env bun
/**
 * Passo "Resolve build args" do `_release.yml`: os build args do app (`SERVICE`) a partir das
 * GitHub Variables (`VARS_JSON`, o `toJSON(vars)` do job), escritos no `$GITHUB_ENV`. O
 * docker-bake.hcl declara cada build arg como `variable`, e o bake lê a variável de ambiente
 * homônima.
 *
 * A lista vem do `buildArgs` do manifesto, e a variável de origem do `buildArgFrom` (o rumaer
 * usa as do sisub), então app novo não edita o workflow. Build arg vazio falha aqui, antes do
 * bake: o bake aceitaria `""` e publicaria um bundle sem a URL do Supabase. Os do
 * `optionalBuildArgs` (o Faro desligado vira no-op) podem sair vazios.
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

if (import.meta.main) {
	// Variáveis do job do GitHub Actions, não do turbo.
	const { SERVICE, VARS_JSON, GITHUB_ENV } = Bun.env
	const app = manifest.apps.find((a) => a.key === SERVICE)
	if (!app) throw new Error(`app desconhecido: ${SERVICE}`)
	const { env, missing } = buildEnvOf(app, JSON.parse(VARS_JSON || "{}"))
	if (missing.length) {
		console.error(`::error::GitHub Variable vazia para o build de ${app.key}: ${missing.join(", ")}`)
		process.exit(1)
	}
	console.log(`build args de ${app.key}: ${Object.keys(env).join(", ") || "(nenhum)"}`)
	if (GITHUB_ENV)
		appendFileSync(
			GITHUB_ENV,
			Object.entries(env)
				.map(([k, v]) => `${k}=${v}\n`)
				.join("")
		)
}
