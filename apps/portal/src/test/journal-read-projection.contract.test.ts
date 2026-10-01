/**
 * Contrato das leituras de artigo do journal.
 *
 * `article-projection.test.ts` prova que a projeção esconde a autoria do revisor; este prova
 * que toda server fn que autoriza leitura por `requireArticleAccess` devolve o resultado
 * PELA projeção — e cobra fn nova sem ninguém lembrar, porque a varredura é sobre o fonte.
 * Antes, `getArticleFn`, `getArticleVersionsFn` e o detalhe devolviam a linha inteira ao
 * revisor (`submitter_id`, coautores, `uploaded_by`), e o duplo-cego dependia da tela não
 * renderizar.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const SOURCE = readFileSync(resolve(import.meta.dir, "../server/journal-data.fn.ts"), "utf8")

/** Corpo de cada `export const <nome> = createServerFn(...)`, até o próximo export. */
function serverFnBlocks(source: string): Map<string, string> {
	const blocks = new Map<string, string>()
	const pattern = /export const (\w+) = createServerFn/g
	const starts = [...source.matchAll(pattern)]
	starts.forEach((match, index) => {
		const end = starts[index + 1]?.index ?? source.length
		blocks.set(match[1], source.slice(match.index, end))
	})
	return blocks
}

const BLOCKS = serverFnBlocks(SOURCE)

describe("leitura de artigo passa pela projeção do acesso", () => {
	const readers = [...BLOCKS].filter(([, body]) => body.includes("requireArticleAccess("))

	test("a varredura encontra as leituras conhecidas", () => {
		const names = readers.map(([name]) => name)
		for (const known of ["getArticleFn", "getArticleWithDetailsFn", "getArticleAuthorsFn", "getArticleVersionsFn", "getLatestArticleVersionFn"]) {
			expect(names).toContain(known)
		}
	})

	for (const [name, body] of readers) {
		test(`${name} devolve o resultado projetado`, () => {
			expect(body).toMatch(/return project\w+\(result, access\)/)
			// Um `return result` cru ao lado da projeção reabriria o vazamento num ramo.
			expect(body).not.toMatch(/return result\b/)
		})
	}
})

describe("superfície removida", () => {
	test("sem criação de artigo já submetido fora do fluxo, nem leitura de rascunho órfã", () => {
		expect(BLOCKS.has("createSubmissionFn")).toBe(false)
		expect(BLOCKS.has("loadDraftFn")).toBe(false)
	})
})

describe("perfil", () => {
	test("getUserProfileFn só devolve o próprio perfil, salvo para editor", () => {
		const body = BLOCKS.get("getUserProfileFn") ?? ""
		expect(body).toContain("data.userId !== userId && !(await isEditor(userId))")
		expect(body).toContain("forbidden(")
	})
})
