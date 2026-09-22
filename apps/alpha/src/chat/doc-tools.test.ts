import { describe, expect, it } from "bun:test"
import { MAX_SEARCH_HITS, readSection, searchDocument } from "./doc-tools.ts"
import { makeDocument } from "./fixtures.test-helpers.ts"

describe("readSection", () => {
	it("devolve a seção com as subseções, e para na seção irmã", () => {
		const section = readSection(makeDocument().nodes, "2")

		expect(section?.text).toBe("2 JUSTIFICATIVA\nO forno atual está fora de uso desde março.\n2.1 Necessidade\nAtender 1.200 refeições por dia.")
		expect(section?.truncated).toBe(false)
	})

	it("aceita o ponto final que o modelo às vezes põe no caminho", () => {
		expect(readSection(makeDocument().nodes, "3.")?.title).toBe("GARANTIA")
	})

	it("caminho inexistente é null, não vazio", () => {
		expect(readSection(makeDocument().nodes, "9.9")).toBeNull()
	})
})

describe("searchDocument", () => {
	it("acha sem acento e sem caixa, e devolve o trecho original com acento", () => {
		const result = searchDocument(makeDocument(), "REFEICOES")

		expect(result.total).toBe(1)
		expect(result.hits[0].excerpt).toContain("refeições")
		expect(result.hits[0].section).toBe("2.1")
	})

	it("conta todas as ocorrências, mas devolve no máximo o teto", () => {
		const doc = makeDocument({ text: "garantia ".repeat(MAX_SEARCH_HITS + 5), nodes: [] })
		const result = searchDocument(doc, "garantia")

		expect(result.total).toBe(MAX_SEARCH_HITS + 5)
		expect(result.hits).toHaveLength(MAX_SEARCH_HITS)
	})

	it("termo curto demais não busca", () => {
		expect(searchDocument(makeDocument(), "a")).toEqual({ total: 0, hits: [] })
	})
})
