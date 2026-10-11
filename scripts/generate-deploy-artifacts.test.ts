import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { artifacts, buildSourceOf, filterKeyOf, manifest } from "./generate-deploy-artifacts"

const pathsFilter = artifacts.find(([file]) => file === ".github/paths-filter.yml")?.[1] ?? ""

describe("paths-filter", () => {
	test("todo app do manifesto tem um filtro, com o nome que o release-plan.ts lê", () => {
		const filters = [...pathsFilter.matchAll(/^([\w-]+):$/gm)].map((m) => m[1])
		expect(filters).toEqual(manifest.apps.map(filterKeyOf))
	})

	test("mudar o pipeline do deploy dispara todo app, inclusive os de imagem de terceiro", () => {
		for (const trigger of [".github/workflows/_release.yml", "scripts/release-plan.ts", "scripts/release-verify.ts"]) {
			const matches = pathsFilter.split("\n").filter((line) => line === `  - '${trigger}'`).length
			expect(matches, trigger).toBe(manifest.apps.length)
		}
	})

	test("app de imagem de terceiro não olha o lockfile do monorepo", () => {
		const pdf = manifest.apps.find((app) => buildSourceOf(app).kind === "dockerfile")
		expect(pdf).toBeDefined()
		const block = pathsFilter.slice(pathsFilter.indexOf(`${filterKeyOf(pdf as (typeof manifest.apps)[number])}:`))
		expect(block.split("\n\n")[0]).not.toContain("bun.lock")
	})
})

describe("deploy.yml", () => {
	const workflow = readFileSync(join(import.meta.dir, "../.github/workflows/deploy.yml"), "utf8")

	test("não guarda mais lista de apps do ECS: ela vem do manifesto em tempo de execução", () => {
		// O site estático (docs) tem jobs próprios, fora da matriz.
		for (const app of manifest.apps.filter((a) => a.release !== "static-site"))
			expect(workflow, app.key).not.toMatch(new RegExp(`\\b(check|build|deploy)-${filterKeyOf(app)}:`))
		expect(workflow).not.toContain("# >>> gerado:")
	})
})
