import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { artifacts, filterKeyOf, manifest } from "./generate-deploy-artifacts"

const workflow = readFileSync(join(import.meta.dir, "../.github/workflows/deploy.yml"), "utf8")

describe("deploy.yml", () => {
	test("as regiões geradas estão em sincronia com o manifesto", () => {
		const [, generated] = artifacts.find(([file]) => file === ".github/workflows/deploy.yml") ?? []
		expect(generated).toBe(workflow)
	})

	test("todo app do manifesto tem o job de deploy escrito à mão (a parte que não é gerada)", () => {
		const missing = manifest.apps.map((app) => `deploy-${filterKeyOf(app).replaceAll("_", "-")}:`).filter((job) => !workflow.includes(`\n  ${job}`))
		expect(missing, "app novo no manifesto sem check/build/deploy no deploy.yml").toEqual([])
	})

	test("todo deploy-<app> do workflow corresponde a um app do manifesto", () => {
		const keys = new Set(manifest.apps.map((app) => filterKeyOf(app).replaceAll("_", "-")))
		const jobs = [...workflow.matchAll(/^ {2}deploy-([\w-]+):$/gm)].map((m) => m[1])
		expect(jobs.filter((job) => !keys.has(job))).toEqual([])
	})
})
