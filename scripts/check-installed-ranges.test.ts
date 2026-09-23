import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { collectInstalledEdges, type Edge, isCheckableRange, judgeEdges, readLockedVersions } from "./check-installed-ranges"

const edge = (partial: Partial<Edge> & Pick<Edge, "owner" | "dep">): Edge => ({
	ownerVersion: "1.0.0",
	range: "^1.0.0",
	kind: "dependência",
	installed: "1.0.0",
	...partial,
})

describe("isCheckableRange", () => {
	test("aceita faixa semver", () => {
		for (const range of ["^1.0.0", "~0.18.20", ">=0.5.0 <1.0.0", "1.x", "*", "x", "5.103.1", "^3.25 || ^4"]) {
			expect(isCheckableRange(range)).toBe(true)
		}
	})

	// `Bun.semver.satisfies` responde `true` para dist-tag e atalho de repositório — contar isso
	// como conferido seria mentir.
	test("recusa protocolo, atalho de repositório e dist-tag", () => {
		for (const range of ["workspace:*", "npm:d@^1", "github:a/b", "owner/repo#v1", "https://x/y.tgz", "file:../x", "latest", "next"]) {
			expect(isCheckableRange(range)).toBe(false)
		}
	})
})

describe("judgeEdges", () => {
	// O caso do #415 que passou por install, typecheck, testes e build.
	test("pega peer instalado fora da faixa", () => {
		const peer = edge({ owner: "@tanstack/openai-base", dep: "@tanstack/ai", range: "^0.58.0", kind: "peer", installed: "0.54.0" })
		expect(judgeEdges([peer], {}).violations).toEqual([peer])
	})

	test("dependência não instalada é violação; peer não instalado não é", () => {
		const dep = edge({ owner: "a", dep: "sumiu", installed: undefined })
		const peer = edge({ owner: "a", dep: "next", kind: "peer", installed: undefined })
		expect(judgeEdges([dep, peer], {}).violations).toEqual([dep])
	})

	test("dentro da faixa não aparece", () => {
		expect(judgeEdges([edge({ owner: "a", dep: "b", range: "^1.0.0", installed: "1.9.9" })], {}).violations).toEqual([])
	})

	test("variantes repetindo a mesma aresta contam uma vez", () => {
		const v = edge({ owner: "a", dep: "b", range: "^2.0.0", installed: "1.0.0" })
		expect(judgeEdges([v, { ...v }, { ...v }], {}).violations).toHaveLength(1)
	})

	describe("FORCED isenta por PAR (consumidor, pacote)", () => {
		const forced = { esbuild: { reason: "motivo", consumers: ["drizzle-kit"] } }

		test("o consumidor listado fica isento", () => {
			const listed = edge({ owner: "drizzle-kit", dep: "esbuild", range: "^0.25.4", installed: "0.28.2" })
			const verdict = judgeEdges([listed], forced)
			expect(verdict.violations).toEqual([])
			expect(verdict.forced).toEqual([listed])
		})

		// Isenção pelo nome do pacote desligaria o gate para todo consumidor NOVO dele — o
		// defeito que o gate existe para pegar.
		test("consumidor NOVO do mesmo pacote falha", () => {
			const listed = edge({ owner: "drizzle-kit", dep: "esbuild", range: "^0.25.4", installed: "0.28.2" })
			const newcomer = edge({ owner: "vite-plugin-x", dep: "esbuild", range: "^0.25.0", installed: "0.28.2" })
			expect(judgeEdges([listed, newcomer], forced).violations).toEqual([newcomer])
		})

		test("consumidor listado que já não viola vira entrada morta", () => {
			const verdict = judgeEdges([edge({ owner: "drizzle-kit", dep: "esbuild", range: "^0.28.0", installed: "0.28.2" })], forced)
			expect(verdict.deadConsumers).toEqual(["esbuild ← drizzle-kit"])
		})

		test("nome herdado de Object.prototype não é isenção", () => {
			const proto = edge({ owner: "a", dep: "constructor", range: "^2.0.0", installed: "1.0.0" })
			expect(judgeEdges([proto], {}).violations).toEqual([proto])
		})
	})
})

describe("readLockedVersions", () => {
	const lock = `{
		"lockfileVersion": 1,
		"workspaces": {},
		"packages": {
			"zod": ["zod@4.6.5", "", {}, "sha512-a"],
			"a/zod": ["zod@4.5.4", "", {}, "sha512-b"],
			"xlsx": ["xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz", { "bin": {} }, "sha512-c"],
		},
	}`

	test("guarda toda versão registrada de cada nome", () => {
		expect([...(readLockedVersions(lock).get("zod") ?? [])].sort()).toEqual(["4.5.4", "4.6.5"])
	})

	test("tarball vale para qualquer versão do nome — o spec é URL, não versão", () => {
		expect(readLockedVersions(lock).get("xlsx")).toEqual(new Set(["*"]))
	})
})

// Árvore falsa no formato do linker isolado: o dono de cada variante é diretório real, as
// dependências dele são symlink.
describe("collectInstalledEdges — lê o disco", () => {
	let root: string

	const writeJson = (path: string, data: unknown) => {
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, JSON.stringify(data))
	}
	const link = (from: string, to: string) => {
		mkdirSync(dirname(from), { recursive: true })
		symlinkSync(relative(dirname(from), to), from)
	}
	const storePkg = (variant: string, name: string) => join(root, "node_modules/.bun", variant, "node_modules", name)

	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), "installed-ranges-"))
		writeJson(join(root, "package.json"), { name: "raiz", workspaces: ["pkgs/*"] })
		writeJson(join(root, "pkgs/app/package.json"), { name: "@iefa/app", dependencies: { a: "^1.0.0", local: "workspace:*" } })

		// a@1.0.0 tem peer b ^2 — e o que está ligado é b 1.5.0.
		writeJson(join(storePkg("a@1.0.0", "a"), "package.json"), { name: "a", version: "1.0.0", peerDependencies: { b: "^2.0.0" } })
		writeJson(join(storePkg("b@1.5.0", "b"), "package.json"), { name: "b", version: "1.5.0" })
		link(join(root, "node_modules/.bun/a@1.0.0/node_modules/b"), storePkg("b@1.5.0", "b"))

		// d@1.0.0 tem peer OPCIONAL c ^5 — ligado a c 1.0.0. Opcional fora da faixa não é defeito.
		writeJson(join(storePkg("d@1.0.0", "d"), "package.json"), {
			name: "d",
			version: "1.0.0",
			peerDependencies: { c: "^5.0.0" },
			peerDependenciesMeta: { c: { optional: true } },
		})
		writeJson(join(storePkg("c@1.0.0", "c"), "package.json"), { name: "c", version: "1.0.0" })
		link(join(root, "node_modules/.bun/d@1.0.0/node_modules/c"), storePkg("c@1.0.0", "c"))
		link(join(root, "node_modules/d"), storePkg("d@1.0.0", "d"))

		// Variante órfã: nada liga para ela.
		writeJson(join(storePkg("orfao@9.0.0", "orfao"), "package.json"), { name: "orfao", version: "9.0.0", dependencies: { sumiu: "^1.0.0" } })

		// Sobra de install incremental: ligada pelo workspace, mas fora do lock.
		writeJson(join(storePkg("sobra@3.0.0", "sobra"), "package.json"), { name: "sobra", version: "3.0.0", dependencies: { sumiu: "^1.0.0" } })

		link(join(root, "node_modules/a"), storePkg("a@1.0.0", "a"))
		link(join(root, "pkgs/app/node_modules/a"), storePkg("a@1.0.0", "a"))
		link(join(root, "pkgs/app/node_modules/sobra"), storePkg("sobra@3.0.0", "sobra"))
	})

	afterAll(() => rmSync(root, { recursive: true, force: true }))

	const locked = new Map([
		["a", new Set(["1.0.0"])],
		["b", new Set(["1.5.0"])],
		["c", new Set(["1.0.0"])],
		["d", new Set(["1.0.0"])],
	])

	test("pega o peer instalado fora da faixa, seguindo o symlink real", () => {
		const { violations } = judgeEdges(collectInstalledEdges(root, locked).edges, {})
		expect(violations).toEqual([edge({ owner: "a", dep: "b", range: "^2.0.0", kind: "peer", installed: "1.5.0" })])
	})

	test("confere a dependência do workspace e pula a faixa `workspace:`", () => {
		const { edges } = collectInstalledEdges(root, locked)
		expect(edges.filter((e) => e.owner === "@iefa/app")).toEqual([
			{ owner: "@iefa/app", ownerVersion: "workspace", dep: "a", range: "^1.0.0", kind: "dependência", installed: "1.0.0" },
		])
	})

	test("peer opcional fora da faixa não é julgado", () => {
		const { edges } = collectInstalledEdges(root, locked)
		expect(edges.some((e) => e.owner === "d" && e.dep === "c")).toBe(false)
	})

	test("variante que nada alcança não é julgada", () => {
		const { edges } = collectInstalledEdges(root, locked)
		expect(edges.some((e) => e.owner === "orfao")).toBe(false)
	})

	// `bun install` não poda loja nem link de workspace. Sem isto, o resultado local diverge do
	// CI, que instala limpo.
	test("instalado mas fora do lock é avisado, não julgado", () => {
		const { edges, stale } = collectInstalledEdges(root, locked)
		expect(stale).toEqual(["sobra@3.0.0"])
		expect(edges.some((e) => e.owner === "sobra")).toBe(false)
	})
})
