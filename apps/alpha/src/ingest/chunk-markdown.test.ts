import { describe, expect, it } from "bun:test"
import { chunkByArticle } from "./chunk-markdown.ts"

/** O mesmo teto do módulo: 512 tokens ≈ 2048 caracteres. */
const MAX_CHARS = 512 * 4

describe("chunkByArticle", () => {
	it("mantém texto curto em um único chunk", () => {
		const chunks = chunkByArticle("Art. 1º Este é um dispositivo curto do regulamento.")

		expect(chunks).toHaveLength(1)
		expect(chunks[0].content).toContain("dispositivo curto")
	})

	it("descarta conteúdo trivial", () => {
		expect(chunkByArticle("oi")).toHaveLength(0)
	})

	it("fatia documento grande em quantos chunks forem necessários", () => {
		// Regressão: partia em EXATAMENTE dois, qualquer que fosse o tamanho. Um manual de
		// 102 KB virava dois chunks de ~12.700 tokens, acima do teto de 8.192 do
		// titan-embed-v2 — o embedding falhava e o documento ficava sem chunk nenhum.
		const chunks = chunkByArticle("palavra ".repeat(13_000))

		expect(chunks.length).toBeGreaterThan(20)
	})

	it("nenhum chunk passa do teto de caracteres", () => {
		for (const chunk of chunkByArticle("conteúdo normativo ".repeat(8_000))) {
			expect(chunk.content.length).toBeLessThanOrEqual(MAX_CHARS)
		}
	})

	it("numera os chunks em sequência, sem buraco nem repetição", () => {
		const indexes = chunkByArticle("texto do regulamento ".repeat(5_000)).map((c) => c.chunk_index)

		expect(indexes).toEqual(indexes.map((_, i) => i))
	})

	it("sobrepõe as fronteiras para não cortar dispositivo ao meio", () => {
		const chunks = chunkByArticle("A".repeat(5_000))
		const somaDosPedacos = chunks.reduce((total, c) => total + c.content.length, 0)

		// Com sobreposição a soma excede o original; sem ela, seria igual.
		expect(somaDosPedacos).toBeGreaterThan(5_000)
	})

	it("descarta comentário HTML, que é metadado e não norma", () => {
		// A procedência que o coletor grava não pode entrar no embedding: disputa espaço
		// no chunk e aparece no texto citado na resposta.
		const chunks = chunkByArticle(`<!-- origem: acervo local, sha256 abc123 -->\n${"O texto normativo de verdade. ".repeat(5)}`)

		expect(chunks.some((c) => c.content.includes("sha256"))).toBe(false)
		expect(chunks[0].content).toContain("texto normativo")
	})

	it("carrega capítulo e artigo para os chunks seguintes", () => {
		const chunks = chunkByArticle(["# Capítulo II", "Disposições gerais do capítulo.", "## Art. 7º", "O texto do artigo sétimo do regulamento."].join("\n"))

		expect(chunks.some((c) => c.chapter.startsWith("Capítulo II"))).toBe(true)
		expect(chunks.some((c) => c.article.startsWith("Art. 7"))).toBe(true)
	})
})
