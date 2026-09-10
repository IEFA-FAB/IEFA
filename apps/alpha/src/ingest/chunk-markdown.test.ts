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

	it("remove comentário aninhado sem deixar resíduo", () => {
		// Uma passada só deixaria `-->` no texto: a remoção do comentário interno cria um
		// delimitador novo, depois do ponto por onde o replace já passou.
		const chunks = chunkByArticle(`<!--<!-- gerado -->-->\n-->\n${"O texto normativo de verdade. ".repeat(5)}`)

		expect(chunks.some((c) => c.content.includes("-->"))).toBe(false)
		expect(chunks.some((c) => c.content.includes("<!--"))).toBe(false)
	})

	it("carrega capítulo e artigo para os chunks seguintes", () => {
		const corpo = "O texto do dispositivo do regulamento. ".repeat(40)
		const chunks = chunkByArticle(["# Capítulo II", corpo, "## Art. 7º", corpo].join("\n"))

		expect(chunks.some((c) => c.chapter.startsWith("Capítulo II"))).toBe(true)
		expect(chunks.some((c) => c.article.startsWith("Art. 7"))).toBe(true)
	})

	it("rotula o chunk com o dispositivo que o ABRIU, não com o último visto", () => {
		// Com o piso de tamanho um chunk atravessa mais de uma fronteira. A citação tem de
		// apontar para onde o texto começa — dizer "Art. 9º" sobre um trecho que começa no
		// 7º manda o leitor conferir o dispositivo errado.
		const chunks = chunkByArticle(["## Art. 7º", "Curto.", "## Art. 8º", "Também curto.", "## Art. 9º", "Fim."].join("\n"))

		expect(chunks).toHaveLength(1)
		expect(chunks[0].article).toBe("Art. 7º")
	})

	it("não fecha chunk em fronteira que renderia migalha", () => {
		// O índice do manual é uma linha por seção. Um vetor por linha de sumário casa com
		// a consulta e não responde nada.
		const indice = Array.from({ length: 12 }, (_, i) => `### 3.${i + 1}. ARRECADAÇÃO DE VALORES POR CÓDIGO`).join("\n")

		expect(chunkByArticle(indice).length).toBeLessThanOrEqual(2)
	})

	it("lê a numeração decimal do manual como dispositivo", () => {
		// O RADA-e é manual administrativo: a portaria numera por artigo, mas os quinze
		// manuais numeram por decimal. Ignorar o segundo deixaria quase todo o corpus sem
		// dispositivo — que era exatamente o estado de produção: 2440 chunks, zero rótulos.
		const corpo = "O Comando da Aeronáutica participa do processo de encerramento. ".repeat(20)
		const chunks = chunkByArticle(["## 14. ENCERRAMENTO", corpo, "### 14.1 GENERALIDADES", corpo, "#### 14.1.1 O disposto neste módulo", corpo].join("\n"))

		expect(chunks.some((c) => c.chapter === "14")).toBe(true)
		expect(chunks.some((c) => c.section === "14.1")).toBe(true)
		expect(chunks.some((c) => c.article === "14.1.1")).toBe(true)
	})

	it("zera o dispositivo mais fundo ao trocar o mais raso", () => {
		// Sem isto, o `14.1.1` do módulo 14 seguiria colado nos chunks do módulo 15 —
		// metadado de citação apontando para norma que não é aquela.
		const corpo = "Texto normativo do dispositivo. ".repeat(40)
		const chunks = chunkByArticle(["#### 14.1.1 Primeiro", corpo, "## 15. OUTRO MÓDULO", corpo].join("\n"))

		expect(chunks.at(-1)?.article).toBe("")
		expect(chunks.at(-1)?.chapter).toBe("15")
	})
})

describe("chunkByArticle — o que a revisão do #302 apontou", () => {
	it("rotula cada janela com o dispositivo vigente NA POSIÇÃO dela", () => {
		// Buffer que passa do teto é fatiado. Com o piso de tamanho ele atravessa várias
		// fronteiras, e a segunda janela pode cair inteira dentro do terceiro dispositivo:
		// citá-la como o primeiro é o erro de rótulo que este trabalho existe para tirar.
		const bloco = "Texto normativo do dispositivo. ".repeat(40)
		const chunks = chunkByArticle(["#### Art. 1º", bloco, "#### Art. 2º", bloco, "#### Art. 3º", bloco].join("\n"))

		expect(chunks.length).toBeGreaterThan(1)
		expect(chunks[0].article).toBe("Art. 1º")
		expect(chunks.at(-1)?.article).not.toBe("Art. 1º")
	})

	it("herda o dispositivo que começa dentro do chunk quando ele abre antes de qualquer um", () => {
		// Todo documento abre com linha em branco e título, ANTES do primeiro dispositivo,
		// então o primeiro chunk saía sem rótulo nenhum. Não é mislabel usar o dispositivo
		// que começa dentro dele: ele está no texto do chunk. Vazio ali era honesto e
		// inútil, e era o que a base recebia.
		const chunks = chunkByArticle(["", "# RADA-e Módulo G", "", "#### Art. 1º Fica instituído o programa.", "Texto do dispositivo. ".repeat(30)].join("\n"))

		expect(chunks[0].article).toBe("Art. 1º")
	})

	it("não captura espaço nem a palavra seguinte no rótulo do artigo", () => {
		// `article: "Art. 12 "` não casa em `.eq("article", …)` nenhum, e `"Art. 3 o"` é
		// rótulo inventado.
		expect(chunkByArticle(`#### Art. 12 do Decreto\n${"Texto. ".repeat(40)}`)[0].article).toBe("Art. 12")
		expect(chunkByArticle(`#### Art. 3 o texto segue\n${"Texto. ".repeat(40)}`)[0].article).toBe("Art. 3")
	})
})
