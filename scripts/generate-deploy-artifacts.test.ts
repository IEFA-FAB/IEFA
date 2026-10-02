import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buildSourceOf, deployRegions, filterKeyOf, manifest, renderDeployWorkflow } from "./generate-deploy-artifacts"

const workflow = readFileSync(join(import.meta.dir, "../.github/workflows/deploy.yml"), "utf8")

/** Bloco de um job do workflow, até o próximo job. */
function jobBlock(name: string): string | undefined {
	const start = workflow.indexOf(`\n  ${name}:\n`)
	if (start === -1) return undefined
	const next = workflow.slice(start + 1).search(/\n {2}[\w-]+:\n/)
	return workflow.slice(start, next === -1 ? undefined : start + 1 + next)
}

describe("deploy.yml — jobs escritos à mão", () => {
	test("todo app do manifesto tem build e deploy, e o deploy depende do build dele", () => {
		const problems: string[] = []
		for (const app of manifest.apps) {
			const job = filterKeyOf(app).replaceAll("_", "-")
			if (!jobBlock(`build-${job}`)) problems.push(`${app.key}: falta build-${job}`)
			const deploy = jobBlock(`deploy-${job}`)
			if (!deploy) problems.push(`${app.key}: falta deploy-${job}`)
			else if (!new RegExp(`needs: \\[build-${job}\\b`).test(deploy)) problems.push(`${app.key}: deploy-${job} não depende de build-${job}`)
		}
		expect(problems, "app novo no manifesto precisa dos jobs no deploy.yml").toEqual([])
	})

	test("todo app do monorepo tem check, e o build depende dele", () => {
		const problems: string[] = []
		// Imagem de terceiro (kind dockerfile) não tem código do repo para checar.
		for (const app of manifest.apps.filter((a) => buildSourceOf(a).kind !== "dockerfile")) {
			const job = filterKeyOf(app).replaceAll("_", "-")
			if (!jobBlock(`check-${job}`)) problems.push(`${app.key}: falta check-${job}`)
			const build = jobBlock(`build-${job}`)
			if (build && !new RegExp(`needs: \\[check-${job}\\b`).test(build)) problems.push(`${app.key}: build-${job} não depende de check-${job}`)
		}
		expect(problems).toEqual([])
	})

	test("todo deploy-<x> do workflow corresponde a um app do manifesto", () => {
		const keys = new Set(manifest.apps.map((app) => filterKeyOf(app).replaceAll("_", "-")))
		const jobs = [...workflow.matchAll(/^ {2}deploy-([\w-]+):$/gm)].map((m) => m[1])
		expect(jobs.filter((job) => !keys.has(job))).toEqual([])
	})
})

describe("renderDeployWorkflow", () => {
	const region = (name: string, indent: string, body = "velho") => `${indent}# >>> gerado: ${name} (x)\n${indent}${body}\n${indent}# <<< gerado: ${name}`

	test("indenta o corpo pelo marcador, onde quer que a região esteja", () => {
		const out = renderDeployWorkflow(`a:\n${region("r", "    ")}\nb: 1`, { r: ["k: 1", "  sub: 2"] })
		expect(out).toBe("a:\n    # >>> gerado: r (bun run generate:deploy; não editar à mão)\n    k: 1\n      sub: 2\n    # <<< gerado: r\nb: 1")
	})

	test("região ausente ou duplicada é erro: a cópia não seria checada", () => {
		expect(() => renderDeployWorkflow("nada", { r: [] })).toThrow(/aparece 0 vez/)
		expect(() => renderDeployWorkflow(`${region("r", "")}\n${region("r", "  ")}`, { r: [] })).toThrow(/aparece 2 vez/)
	})

	test("chave que começa por dígito sai entre colchetes", () => {
		const outputs = deployRegions()["changes-outputs"]
		// biome-ignore lint/suspicious/noTemplateCurlyInString: é a expressão do GitHub Actions, não template JS.
		expect(outputs).toContain("5s: ${{ steps.final.outputs['5s'] }}")
	})

	test("alias de imagem de terceiro fica fora do warm-deps, como no paths-filter", () => {
		const pdf = manifest.apps.find((app) => app.kind === "dockerfile")
		expect(pdf).toBeDefined()
		const apps = [...manifest.apps, { ...(pdf as (typeof manifest.apps)[number]), key: "pdf2", kind: undefined, aliasOf: pdf?.key }]
		const condition = deployRegions(apps)["warm-deps-if"].join("\n")
		expect(condition).not.toContain("outputs.pdf2")
		expect(condition).not.toContain("outputs.pdf ")
	})
})
