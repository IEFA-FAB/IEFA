import { describe, expect, it } from "bun:test"
import { fromDateInputValue, newDocument } from "./draft"
import { AiProposalSchema, DocumentPayloadSchema, fromPayload, toPayload } from "./schema"

describe("payload gravado no jsonb", () => {
	it("preserva a data pela ida e volta", () => {
		const input = { ...newDocument(), city: "Brasília", date: new Date(2026, 6, 3) }
		const roundTripped = fromPayload(toPayload(input))
		// Sem o par ISO/Date, o documento salvo abriria com `data.getDate is not a function`
		// — e só ao ABRIR, nunca ao salvar.
		expect(roundTripped.date).toBeInstanceOf(Date)
		expect(roundTripped.date.getTime()).toBe(input.date.getTime())
		expect(roundTripped.city).toBe("Brasília")
	})

	it("rejeita payload sem os campos que a montagem exige", () => {
		expect(() => DocumentPayloadSchema.parse({ kind: "oficio-comaer" })).toThrow()
	})

	it("aceita sequencial nulo — é o s/nº do art. 51 § 6º, não um campo faltando", () => {
		const input = { ...newDocument(), numbering: { sequence: null } }
		expect(fromPayload(toPayload(input)).numbering.sequence).toBeNull()
	})
})

describe("saída do modelo", () => {
	/**
	 * Modelo não omite campo opcional: ele manda `null`. E `null` DENTRO de array chega
	 * inteiro no parse, porque a normalização de nulos do boundary não desce em array.
	 * Sem `.nullish()` nesses campos, a geração morre em erro de schema — que é a falha
	 * registrada no CLAUDE.md como já tendo matado run de tool no sisub.
	 */
	it("aceita null nos opcionais aninhados em array e os normaliza para ausência", () => {
		const output = AiProposalSchema.parse({
			subject: null,
			references: null,
			annexes: null,
			paragraphs: [
				{ text: "Primeiro.", items: null },
				{ text: "Segundo.", items: [{ text: "Item", alineas: null }] },
			],
		})
		expect(output.subject).toBeUndefined()
		expect(output.references).toBeUndefined()
		expect(output.paragraphs[0].items).toBeUndefined()
		expect(output.paragraphs[1].items?.[0].alineas).toBeUndefined()
	})

	it("preserva a hierarquia completa quando o modelo a devolve", () => {
		const output = AiProposalSchema.parse({
			subject: "Levantamento de contratações",
			paragraphs: [{ text: "P", items: [{ text: "I", alineas: [{ text: "a", subalineas: [{ text: "s" }] }] }] }],
		})
		expect(output.paragraphs[0].items?.[0].alineas?.[0].subalineas?.[0].text).toBe("s")
	})

	it("exige ao menos um parágrafo — resposta sem texto não é redação", () => {
		expect(() => AiProposalSchema.parse({ paragraphs: [] })).toThrow()
	})
})

describe("data vinda do formulário", () => {
	it("campo de data limpo não datava o documento em 1900", () => {
		// `<input type="date">` limpo devolve "": com o `?? 1` de antes, `new Date(NaN, -1, 1)`
		// virava 1º de janeiro de 1900 e o rascunho gravava isso sem avisar ninguém.
		const hoje = new Date()
		expect(fromDateInputValue("").getFullYear()).toBe(hoje.getFullYear())
		expect(fromDateInputValue("2026-07-03").getDate()).toBe(3)
		expect(fromDateInputValue("2026-07-03").getMonth()).toBe(6)
	})
})
