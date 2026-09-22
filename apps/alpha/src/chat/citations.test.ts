import { describe, expect, it } from "bun:test"
import { resolveCitations, stripCitationLabels, type TurnCatalog } from "./citations.ts"
import { makeDocument, makeFinding } from "./fixtures.test-helpers.ts"

const catalog: TurnCatalog = {
	normas: new Map([
		["N1", { label: "N1", chunk_id: "chunk-1", source: "Lei 14.133/2021" }],
		["N2", { label: "N2", chunk_id: "chunk-2", source: null }],
	]),
	findings: [makeFinding()],
	documents: [makeDocument()],
}

describe("resolveCitations", () => {
	it("mantém o rótulo que tem fonte e o devolve resolvido", () => {
		const result = resolveCitations("O ETP é obrigatório [N1].", catalog)

		expect(result.content).toBe("O ETP é obrigatório [N1].")
		expect(result.citations).toEqual([{ label: "N1", kind: "norma", ref: "chunk-1", source: "Lei 14.133/2021" }])
		expect(result.dropped).toBe(0)
	})

	it("tira do texto o trecho de norma que não foi buscado neste turno", () => {
		const result = resolveCitations("Conforme o art. 18 [N5], o prazo é de 30 dias.", catalog)

		expect(result.content).toBe("Conforme o art. 18, o prazo é de 30 dias.")
		expect(result.citations).toEqual([])
		expect(result.dropped).toBe(1)
	})

	it("tira o achado fora da lista do turno", () => {
		const result = resolveCitations("Veja o achado [A7].", catalog)
		expect(result.content).toBe("Veja o achado.")
		expect(result.dropped).toBe(1)
	})

	it("tira a seção que não existe no documento", () => {
		const result = resolveCitations("Na seção de prazos [D1:8.4] falta o marco inicial.", catalog)
		expect(result.content).toBe("Na seção de prazos falta o marco inicial.")
		expect(result.dropped).toBe(1)
	})

	it("desmonta o grupo e fica só com o que resolve", () => {
		const result = resolveCitations("Fundamento [N1, N9; A1].", catalog)

		expect(result.content).toBe("Fundamento [N1][A1].")
		expect(result.citations.map((citation) => citation.label)).toEqual(["N1", "A1"])
		expect(result.dropped).toBe(1)
	})

	it("citação literal presente no documento sai localizada", () => {
		const result = resolveCitations('O TR diz "A garantia será de 12 meses" [D1:3].', catalog)

		expect(result.citations[0]).toMatchObject({ kind: "documento", path: "3", section_title: "GARANTIA", located: true, quote: "A garantia será de 12 meses" })
	})

	it("citação literal que não consta do documento sai marcada como não localizada", () => {
		const result = resolveCitations('O TR diz "a garantia será de 60 meses com assistência técnica 24 horas" [D1:3].', catalog)

		expect(result.citations[0]).toMatchObject({ kind: "documento", located: false })
		// O rótulo continua: a seção existe. O que a tela precisa saber é que a frase não.
		expect(result.content).toContain("[D1:3]")
	})

	it("uma citação inventada derruba a marca mesmo que outra, com o mesmo rótulo, confira", () => {
		const result = resolveCitations(
			'Primeiro "A garantia será de 12 meses" [D1:3]. Depois "garantia estendida por cinco anos com troca imediata" [D1:3].',
			catalog
		)
		expect(result.citations).toHaveLength(1)
		expect(result.citations[0]).toMatchObject({ located: false })
	})

	it("rótulo sem aspas antes é referência à seção, sem conferência literal", () => {
		const result = resolveCitations("A garantia está na seção 3 [D1:3].", catalog)
		expect(result.citations[0]).not.toHaveProperty("located")
	})

	it("não deixa rótulo dentro do bloco de redação — ele iria para o documento oficial", () => {
		const text = "Proposta:\n```redacao\nSeção: 3\nA garantia será acionada por ofício [N1].\n```\nFundamento [N1]."
		const result = resolveCitations(text, catalog)

		expect(result.content).toContain("A garantia será acionada por ofício.\n```")
		expect(result.content).toContain("Fundamento [N1].")
	})

	it("não come a quebra de linha antes do rótulo descartado", () => {
		expect(resolveCitations("linha 1\n[N9] linha 2", catalog).content).toBe("linha 1\n linha 2")
	})
})

describe("stripCitationLabels", () => {
	it("tira todo rótulo, para o histórico reenviado ao modelo não citar fonte de outro turno", () => {
		expect(stripCitationLabels("Sim [N1][A2], e também [D1:3.2].")).toBe("Sim, e também.")
	})
})
