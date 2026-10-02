/**
 * Contrato das regras do Opengrep (`.opengrep/rules/*.yaml`): regra que não enxerga arquivo
 * nenhum é gate morto.
 *
 * O `scan:rules` e o job `opengrep` do CI dizem "0 achados" tanto quando o código está certo
 * quanto quando o `paths.include` da regra aponta para um arquivo que não existe mais. Foi o que
 * aconteceu no lote 1 da linguagem ubíqua: `liquidation.fn.ts` virou `liquidacao.fn.ts`, e a
 * regra `money-tofixed-rounding` continuou listando o nome antigo, verde e sem olhar nada.
 *
 * Este teste exige que cada padrão de `paths.include` case ao menos um arquivo em `apps/` ou
 * `packages/` (os alvos do scan). Renomear o arquivo sem atualizar a regra passa a quebrar aqui.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, parse, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const serverDir = dirname(fileURLToPath(import.meta.url))

function monorepoRoot(): string {
	let dir = serverDir
	while (!existsSync(join(dir, "apps.manifest.json"))) {
		const parent = dirname(dir)
		if (parent === dir || dir === parse(dir).root) throw new Error(`apps.manifest.json não encontrado subindo de ${serverDir}`)
		dir = parent
	}
	return dir
}

const root = monorepoRoot()
const rulesDir = join(root, ".opengrep", "rules")

/** Diretórios que o scan não lê (gerados, dependências) — só aceleram a varredura. */
const SKIPPED_DIRS = new Set(["node_modules", ".git", ".output", ".nitro", ".tanstack", ".turbo", "dist", "playwright-report", "test-results", ".source"])

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : walk(join(dir, entry.name))
		return entry.isFile() ? [relative(root, join(dir, entry.name))] : []
	})
}

/** Glob do Semgrep/Opengrep (sintaxe do gitignore) → RegExp sobre o caminho relativo à raiz. */
function globToRegExp(glob: string): RegExp {
	let source = ""
	for (let i = 0; i < glob.length; i++) {
		const char = glob[i] as string
		if (char === "*" && glob[i + 1] === "*") {
			const slashAfter = glob[i + 2] === "/"
			source += slashAfter ? "(?:.*/)?" : ".*"
			i += slashAfter ? 2 : 1
		} else if (char === "*") {
			source += "[^/]*"
		} else if (char === "?") {
			source += "[^/]"
		} else {
			source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		}
	}
	// Sem barra, o padrão casa o nome em qualquer nível; com barra, é ancorado na raiz. Casar um
	// diretório inclui o que está dentro dele.
	const anchored = glob.includes("/") ? `^${source}` : `(?:^|/)${source}`
	return new RegExp(`${anchored}(?:/.*)?$`)
}

/** Padrões de `paths.include` de cada regra, lidos por linha (o YAML das regras é regular). */
function includePatterns(yaml: string): { rule: string; pattern: string }[] {
	const out: { rule: string; pattern: string }[] = []
	let rule = "?"
	let includeIndent: number | null = null
	for (const line of yaml.split("\n")) {
		const id = /^\s*- id:\s*([\w-]+)/.exec(line)
		if (id) {
			rule = id[1] as string
			includeIndent = null
			continue
		}
		const include = /^(\s*)include:\s*$/.exec(line)
		if (include) {
			includeIndent = (include[1] as string).length
			continue
		}
		if (includeIndent === null) continue
		if (/^\s*(#.*)?$/.test(line)) continue
		const item = /^(\s*)-\s+["']?([^"'#]+?)["']?\s*(#.*)?$/.exec(line)
		if (item && (item[1] as string).length > includeIndent) {
			out.push({ rule, pattern: item[2] as string })
			continue
		}
		includeIndent = null
	}
	return out
}

describe("regras do Opengrep enxergam o que dizem vigiar", () => {
	const ruleFiles = readdirSync(rulesDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
	const files = [...walk(join(root, "apps")), ...walk(join(root, "packages"))]
	const patterns = ruleFiles.flatMap((file) => includePatterns(readFileSync(join(rulesDir, file), "utf8")).map((p) => ({ file, ...p })))

	test("o parser acha regras e padrões (proteção contra um teste que passa vazio)", () => {
		expect(ruleFiles.length).toBeGreaterThan(10)
		expect(patterns.length).toBeGreaterThan(20)
		expect(patterns).toContainEqual(expect.objectContaining({ rule: "money-tofixed-rounding", pattern: "apps/sisub/src/server/liquidacao.fn.ts" }))
	})

	test("o glob segue a sintaxe do gitignore", () => {
		expect(globToRegExp("apps/sisub/src/server/*.fn.ts").test("apps/sisub/src/server/liquidacao.fn.ts")).toBe(true)
		expect(globToRegExp("apps/sisub/src/server/*.fn.ts").test("apps/sisub/src/server/x/liquidacao.fn.ts")).toBe(false)
		expect(globToRegExp("apps/**/*.ts").test("apps/sisub/src/a.ts")).toBe(true)
		expect(globToRegExp("apps/*/src/**").test("apps/sisub/src/lib/a.ts")).toBe(true)
		expect(globToRegExp("**/*.contract.test.ts").test("apps/sisub/src/a.contract.test.ts")).toBe(true)
		expect(globToRegExp("apps/sisub/src/routes/$kitchenId/x.tsx").test("apps/sisub/src/routes/$kitchenId/x.tsx")).toBe(true)
		expect(globToRegExp("apps/sisub/src/server/liquidacao-old.fn.ts").test("apps/sisub/src/server/liquidacao.fn.ts")).toBe(false)
	})

	test("todo `paths.include` casa ao menos um arquivo de apps/ ou packages/", () => {
		const dead = patterns.filter(({ pattern }) => {
			const regex = globToRegExp(pattern)
			return !files.some((f) => regex.test(f))
		})
		expect(
			dead.map(({ file, rule, pattern }) => `${file} › ${rule}: "${pattern}" não casa arquivo nenhum`),
			"regra que não enxerga arquivo nenhum passa verde sem vigiar nada: atualize o caminho"
		).toEqual([])
	})
})
