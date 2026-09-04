import { describe, expect, it } from "bun:test"
import { assembleDocument } from "./assemble"
import { newDocument } from "./draft"
import { applyInlineEdit } from "./inline-edit"
import type { DocumentInput } from "./types"

function document(): DocumentInput {
	return {
		...newDocument(),
		om: { name: "IEFA" },
		city: "Brasília",
		subject: "Assunto original",
		references: ["Ofício nº 1/GAB/2", "Proc nº 3"],
		annexes: ["Planilha"],
		paragraphs: [
			{
				text: "Solicito a prorrogação por 30 dias.",
				items: [{ text: "consolidação por UG", alineas: [{ text: "com objeto", subalineas: [{ text: "e instrumento" }] }] }],
			},
			{ text: "Segundo parágrafo." },
		],
	}
}

describe("edição direto no papel", () => {
	it("troca um número no parágrafo sem passar pela IA nem pelo formulário", () => {
		const edited = applyInlineEdit(document(), { field: "paragraph", paragraph: 0 }, "Solicito a prorrogação por 60 dias.")
		expect(edited.paragraphs[0].text).toBe("Solicito a prorrogação por 60 dias.")
		expect(edited.paragraphs[0].items?.[0].text).toBe("consolidação por UG")
		expect(edited.paragraphs[1].text).toBe("Segundo parágrafo.")
	})

	it("escreve nos quatro níveis da divisão do texto", () => {
		let doc = document()
		doc = applyInlineEdit(doc, { field: "item", paragraph: 0, item: 0 }, "novo item")
		doc = applyInlineEdit(doc, { field: "alinea", paragraph: 0, item: 0, alinea: 0 }, "nova alínea")
		doc = applyInlineEdit(doc, { field: "subalinea", paragraph: 0, item: 0, alinea: 0, subalinea: 0 }, "nova subalínea")
		expect(doc.paragraphs[0].items?.[0].text).toBe("novo item")
		expect(doc.paragraphs[0].items?.[0].alineas?.[0].text).toBe("nova alínea")
		expect(doc.paragraphs[0].items?.[0].alineas?.[0].subalineas?.[0].text).toBe("nova subalínea")
	})

	it("edita assunto, referência e anexo pelo lugar em que aparecem", () => {
		let doc = applyInlineEdit(document(), { field: "subject" }, "Assunto novo")
		doc = applyInlineEdit(doc, { field: "reference", index: 1 }, "Proc nº 9")
		doc = applyInlineEdit(doc, { field: "annex", index: 0 }, "Relação nominal")
		expect(doc.subject).toBe("Assunto novo")
		expect(doc.references).toEqual(["Ofício nº 1/GAB/2", "Proc nº 9"])
		expect(doc.annexes).toEqual(["Relação nominal"])
	})

	it("alvo fora do documento não cria campo nem quebra", () => {
		const doc = document()
		expect(applyInlineEdit(doc, { field: "paragraph", paragraph: 9 }, "x")).toEqual(doc)
		expect(applyInlineEdit(doc, { field: "reference", index: 9 }, "x")).toEqual(doc)
		expect(applyInlineEdit(doc, { field: "alinea", paragraph: 1, item: 0, alinea: 0 }, "x")).toEqual(doc)
	})
})

describe("origem das linhas da folha", () => {
	/**
	 * O que a folha mostra é derivado: "1. Trata-se…" e "Assunto: X.". Sem carregar o texto
	 * CRU junto, clicar para editar abriria a caixa com o marcador dentro, e salvar gravaria
	 * "1. 1. Trata-se…" no documento.
	 */
	it("linha editável carrega o valor cru, sem marcador nem rótulo", () => {
		const assembled = assembleDocument(document())
		const lines = assembled.blocks.flatMap((b) => b.lines)

		const subject = lines.find((l) => l.edit?.target.field === "subject")
		expect(subject?.text).toBe("Assunto: Assunto original.")
		expect(subject?.edit?.value).toBe("Assunto original")

		const paragraph = lines.find((l) => l.edit?.target.field === "paragraph")
		expect(paragraph?.text.startsWith("1. ")).toBe(true)
		expect(paragraph?.edit?.value).toBe("Solicito a prorrogação por 30 dias.")
	})

	it("o que a montagem compõe de vários campos não é editável no papel", () => {
		// Numeração e preâmbulo juntam campos e prefixos; editá-los no papel exigiria
		// desmontar a frase de volta, e é para isso que existe o formulário.
		const assembled = assembleDocument(document())
		const numbering = assembled.blocks.find((b) => b.id === "numeracao")
		expect(numbering?.lines[0].edit).toBeUndefined()
	})
})
