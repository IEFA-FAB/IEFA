import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { manifest } from "./generate-deploy-artifacts"
import { allBuildEnvOf, buildArgSourcesOf, buildEnvOf } from "./release-build-env"

const app = (key: string) => {
	const found = manifest.apps.find((a) => a.key === key)
	if (!found) throw new Error(key)
	return found
}

describe("buildEnvOf", () => {
	test("build arg sai da variável de mesmo nome", () => {
		const { env, missing } = buildEnvOf(app("portal"), { VITE_IEFA_SUPABASE_URL: "u", VITE_IEFA_SUPABASE_PUBLISHABLE_KEY: "k" })
		expect(env).toEqual({ VITE_IEFA_SUPABASE_URL: "u", VITE_IEFA_SUPABASE_PUBLISHABLE_KEY: "k" })
		expect(missing).toEqual([])
	})

	test("buildArgFrom: o rumaer usa as variáveis do sisub", () => {
		const { env } = buildEnvOf(app("rumaer"), { VITE_SISUB_SUPABASE_URL: "u", VITE_SISUB_SUPABASE_PUBLISHABLE_KEY: "k" })
		expect(env).toEqual({ VITE_RUMAER_SUPABASE_URL: "u", VITE_RUMAER_SUPABASE_PUBLISHABLE_KEY: "k" })
	})

	test("variável obrigatória vazia é falta; a opcional (Faro) pode faltar", () => {
		const { missing } = buildEnvOf(app("sisub"), { VITE_SISUB_SUPABASE_URL: "u" })
		expect(missing).toEqual(["VITE_SISUB_SUPABASE_PUBLISHABLE_KEY"])
		const rumaer = buildEnvOf(app("rumaer"), {})
		expect(rumaer.missing).toContain("VITE_RUMAER_SUPABASE_URL (da variável VITE_SISUB_SUPABASE_URL)")
	})

	test("valor com quebra de linha não entra no $GITHUB_ENV", () => {
		expect(() => buildEnvOf(app("portal"), { VITE_IEFA_SUPABASE_URL: "u\nX=1", VITE_IEFA_SUPABASE_PUBLISHABLE_KEY: "k" })).toThrow(/quebra de linha/)
	})

	test("todo buildArgFrom e optionalBuildArgs aponta para um build arg do próprio app", () => {
		const problems = manifest.apps.flatMap((a) =>
			[...Object.keys(a.buildArgFrom ?? {}), ...(a.optionalBuildArgs ?? [])].filter((arg) => !a.buildArgs.includes(arg)).map((arg) => `${a.key}: ${arg}`)
		)
		expect(problems).toEqual([])
	})
})

describe("allBuildEnvOf (pr-check)", () => {
	const sources = buildArgSourcesOf(manifest.apps)

	test("os apps que usam o Supabase do sisub recebem as variáveis do sisub", () => {
		const vars = Object.fromEntries([...new Set(sources.values())].map((from) => [from, `v:${from}`]))
		const { env, undeclared, empty } = allBuildEnvOf(manifest.apps, vars)
		expect(undeclared).toEqual([])
		expect(empty).toEqual([])
		for (const prefix of ["RUMAER", "SUCONT", "ASSIGNMENT_SELECTION"]) {
			expect(env[`VITE_${prefix}_SUPABASE_URL`]).toBe("v:VITE_SISUB_SUPABASE_URL")
			expect(env[`VITE_${prefix}_SUPABASE_PUBLISHABLE_KEY`]).toBe("v:VITE_SISUB_SUPABASE_PUBLISHABLE_KEY")
		}
	})

	test("variável não declarada no passo falha; declarada e vazia só avisa", () => {
		const { undeclared, empty } = allBuildEnvOf(manifest.apps, { VITE_SISUB_SUPABASE_URL: "" })
		expect(undeclared).toContain("VITE_SISUB_SUPABASE_PUBLISHABLE_KEY")
		expect(undeclared).not.toContain("VITE_SISUB_SUPABASE_URL")
		expect(empty).toEqual(["VITE_SISUB_SUPABASE_URL"])
	})

	test("mesmo build arg lido de variáveis diferentes é erro", () => {
		const portal = app("portal")
		const conflicting = { ...portal, key: "x", buildArgFrom: { VITE_IEFA_SUPABASE_URL: "OUTRA" } }
		expect(() => buildArgSourcesOf([portal, conflicting])).toThrow(/OUTRA/)
	})

	test("o passo do pr-check.yml declara toda variável de origem do manifesto", () => {
		const prCheck = readFileSync(join(import.meta.dir, "../.github/workflows/pr-check.yml"), "utf8")
		for (const from of new Set(sources.values())) expect(prCheck, from).toContain(`${from}: \${{ vars.${from} }}`)
	})
})

describe("segredos de build", () => {
	const release = readFileSync(join(import.meta.dir, "../.github/workflows/_release.yml"), "utf8")
	const deploy = readFileSync(join(import.meta.dir, "../.github/workflows/deploy.yml"), "utf8")

	test("todo buildSecrets do manifesto é declarado no _release.yml e repassado pelo deploy.yml", () => {
		const secrets = [...new Set(manifest.apps.flatMap((a) => a.buildSecrets ?? []))]
		expect(secrets.length).toBeGreaterThan(0)
		for (const name of secrets) {
			expect(release, `_release.yml: ${name}`).toMatch(new RegExp(`^ {6}${name}:$`, "m"))
			expect(deploy, `deploy.yml: ${name}`).toContain(`contains(matrix.build_secrets, '${name}') && secrets.${name}`)
		}
	})
})
