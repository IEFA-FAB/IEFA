import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { manifest } from "./generate-deploy-artifacts"
import { checkTasksOf, groupsOf, outcomesOf, PACKAGES, readWorkspaces, releaseEntriesOf } from "./release-verify"

const app = (key: string) => {
	const found = manifest.apps.find((a) => a.key === key)
	if (!found) throw new Error(key)
	return found
}

describe("checkTasksOf", () => {
	test("padrão: lint, typecheck e test do workspace", () => {
		expect(checkTasksOf(app("api"))).toEqual(["@iefa/api#lint", "@iefa/api#typecheck", "@iefa/api#test"])
	})

	test("alias herda as tarefas do app de origem", () => {
		expect(checkTasksOf(app("5s"))).toEqual(checkTasksOf(app("forms")))
	})

	test("imagem de terceiro não tem o que checar", () => {
		expect(checkTasksOf(app("pdf"))).toEqual([])
	})

	test("o sisub roda só o teste unitário, e os packages que o liberam", () => {
		const tasks = checkTasksOf(app("sisub"))
		expect(tasks).toContain("@iefa/sisub#test:unit")
		expect(tasks).not.toContain("@iefa/sisub#test")
		expect(tasks).toContain("@iefa/pbac#test")
	})
})

describe("groupsOf", () => {
	const workspaces = readWorkspaces()

	test("toda tarefa do manifesto existe no workspace dela", () => {
		expect(() =>
			groupsOf(
				manifest.apps.map((a) => a.key),
				workspaces
			)
		).not.toThrow()
	})

	test("os testes dos packages entram sempre, mesmo sem app no plano", () => {
		const groups = groupsOf([], workspaces)
		expect([...groups.keys()]).toEqual([PACKAGES])
		expect(groups.get(PACKAGES)).toContain("@iefa/pbac#test")
	})

	test("tarefa que o workspace não declara é erro, não verde", () => {
		const broken = [{ ...app("api"), check: ["@iefa/api#nao-existe"] }]
		expect(() => groupsOf(["api"], workspaces, broken)).toThrow(/sem script.*nao-existe/)
	})
})

describe("outcomesOf e releaseEntriesOf", () => {
	const groups = new Map([
		["api", ["@iefa/api#lint", "@iefa/api#test"]],
		["pdf", []],
		["docs", ["@iefa/docs#lint"]],
		[PACKAGES, ["@iefa/pbac#test"]],
	])

	test("app com tarefa vermelha ou ausente do resumo fica de fora; os outros seguem", () => {
		// `@iefa/api#test` não está no resumo: não rodou porque uma dependência falhou.
		const outcomes = outcomesOf(
			groups,
			new Map([
				["@iefa/api#lint", 0],
				["@iefa/docs#lint", 0],
				["@iefa/pbac#test", 1],
			])
		)
		expect(outcomes.map((o) => [o.group, o.ok])).toEqual([
			["api", false],
			["pdf", true],
			["docs", true],
			[PACKAGES, false],
		])
		expect(outcomes[0]?.failed).toEqual(["@iefa/api#test"])
		// O site estático não entra na matriz do ECS; o pdf, sem tarefa, passa.
		expect(releaseEntriesOf(outcomes).map((e) => e.key)).toEqual(["pdf"])
	})

	test("a entrada da matriz leva os timeouts e a variável do smoke test do manifesto", () => {
		const [pdf] = releaseEntriesOf([{ group: "pdf", ok: true, failed: [] }])
		expect(pdf).toEqual({ key: "pdf", health_var: "PDF_HEALTH_URL", build_timeout: 40, attempt_timeout: 25 })
	})

	test("todo app do ECS tem a variável do smoke test", () => {
		const missing = manifest.apps.filter((a) => a.release !== "static-site" && !a.healthUrlVar).map((a) => a.key)
		expect(missing).toEqual([])
	})

	test("o job release do deploy.yml lê os campos que a matriz tem", () => {
		const workflow = readFileSync(join(import.meta.dir, "../.github/workflows/deploy.yml"), "utf8")
		const [entry] = releaseEntriesOf([{ group: "api", ok: true, failed: [] }])
		for (const field of Object.keys(entry ?? {})) expect(workflow, field).toContain(`matrix.${field}`)
	})
})
