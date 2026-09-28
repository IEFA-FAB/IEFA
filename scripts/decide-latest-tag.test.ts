import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * `decide-latest-tag.sh` roda sob o `bash -e` do runner (o passo "Decide whether to move
 * :latest" de `_app-build.yml`). Uma leitura que falhava derrubou todos os builds de push do
 * CI/CD de 1c188c77; aqui o script roda do mesmo jeito, com `docker` e `gh` simulados.
 */
const SCRIPT = join(import.meta.dir, "decide-latest-tag.sh")

let dir = ""
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "decide-latest-"))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Stub de comando: imprime `stdout`, `stderr` e sai com `code`. */
function stub(name: string, { stdout = "", stderr = "", code = 0 }: { stdout?: string; stderr?: string; code?: number }) {
	const path = join(dir, name)
	writeFileSync(path, `#!/usr/bin/env bash\nprintf '%s' ${JSON.stringify(stdout)}\nprintf '%s' ${JSON.stringify(stderr)} >&2\nexit ${code}\n`)
	chmodSync(path, 0o755)
}

function run(event = "push") {
	const output = join(dir, "out")
	writeFileSync(output, "")
	const proc = Bun.spawnSync(["bash", "-e", "-o", "pipefail", SCRIPT], {
		env: {
			PATH: `${dir}:${process.env.PATH}`,
			EVENT_NAME: event,
			IMAGE_REPO: "registry/iefa/prod/sisub",
			GITHUB_REPOSITORY: "IEFA-FAB/IEFA",
			GITHUB_SHA: "b".repeat(40),
			GITHUB_OUTPUT: output,
		},
	})
	return { code: proc.exitCode, stdout: proc.stdout.toString(), move: readFileSync(output, "utf8").trim() }
}

const withRevision = (sha: string) => JSON.stringify({ config: { Labels: { "org.opencontainers.image.revision": sha } } })
const perPlatform = (sha: string) => JSON.stringify({ "linux/amd64": { config: { Labels: { "org.opencontainers.image.revision": sha } } } })

describe("decide-latest-tag.sh", () => {
	test("workflow_dispatch move sempre, sem ler o registry", () => {
		stub("docker", { code: 1, stderr: "não devia ser chamado" })
		expect(run("workflow_dispatch")).toMatchObject({ code: 0, move: "move=true" })
	})

	test("inspect que falha não derruba o build: move, com warning e o erro", () => {
		stub("docker", { code: 1, stderr: "ERROR: failed to authorize" })
		const r = run()
		expect(r).toMatchObject({ code: 0, move: "move=true" })
		expect(r.stdout).toContain("::warning::")
		expect(r.stdout).toContain("failed to authorize")
	})

	test("imagem sem a label de revisão (anterior ao guard): move, com notice", () => {
		stub("docker", { stdout: JSON.stringify({ config: { Labels: null } }) })
		const r = run()
		expect(r).toMatchObject({ code: 0, move: "move=true" })
		expect(r.stdout).toContain("::notice::")
	})

	test("compare que falha: move, com warning", () => {
		stub("docker", { stdout: withRevision("a".repeat(40)) })
		stub("gh", { code: 1, stderr: "HTTP 404" })
		const r = run()
		expect(r).toMatchObject({ code: 0, move: "move=true" })
		expect(r.stdout).toContain("HTTP 404")
	})

	test("este build é mais novo que :latest (ahead): move", () => {
		stub("docker", { stdout: perPlatform("a".repeat(40)) })
		stub("gh", { stdout: "ahead" })
		expect(run()).toMatchObject({ code: 0, move: "move=true" })
	})

	test(":latest já tem commit mais novo (behind): publica só a tag de SHA", () => {
		stub("docker", { stdout: withRevision("c".repeat(40)) })
		stub("gh", { stdout: "behind" })
		const r = run()
		expect(r).toMatchObject({ code: 0, move: "move=false" })
		expect(r.stdout).toContain("::warning::")
	})

	test("diverged não trava :latest para sempre: move, com warning", () => {
		stub("docker", { stdout: withRevision("d".repeat(40)) })
		stub("gh", { stdout: "diverged" })
		const r = run()
		expect(r).toMatchObject({ code: 0, move: "move=true" })
		expect(r.stdout).toContain("::warning::")
	})
})
