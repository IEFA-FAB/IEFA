import { describe, expect, it } from "bun:test"
import { deInputDate, rascunhoInicial } from "./rascunho"
import { DocumentoPayloadSchema, dePayload, paraPayload, RedacaoIaSchema } from "./schema"

describe("payload gravado no jsonb", () => {
	it("preserva a data pela ida e volta", () => {
		const input = { ...rascunhoInicial(), localidade: "Brasília", data: new Date(2026, 6, 3) }
		const voltou = dePayload(paraPayload(input))
		// Sem o par ISO/Date, o documento salvo abriria com `data.getDate is not a function`
		// — e só ao ABRIR, nunca ao salvar.
		expect(voltou.data).toBeInstanceOf(Date)
		expect(voltou.data.getTime()).toBe(input.data.getTime())
		expect(voltou.localidade).toBe("Brasília")
	})

	it("rejeita payload sem os campos que a montagem exige", () => {
		expect(() => DocumentoPayloadSchema.parse({ especie: "oficio-comaer" })).toThrow()
	})

	it("aceita sequencial nulo — é o s/nº do art. 51 § 6º, não um campo faltando", () => {
		const input = { ...rascunhoInicial(), numeracao: { sequencial: null } }
		expect(dePayload(paraPayload(input)).numeracao.sequencial).toBeNull()
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
		const saida = RedacaoIaSchema.parse({
			assunto: null,
			referencias: null,
			anexos: null,
			paragrafos: [
				{ texto: "Primeiro.", itens: null },
				{ texto: "Segundo.", itens: [{ texto: "Item", alineas: null }] },
			],
		})
		expect(saida.assunto).toBeUndefined()
		expect(saida.referencias).toBeUndefined()
		expect(saida.paragrafos[0].itens).toBeUndefined()
		expect(saida.paragrafos[1].itens?.[0].alineas).toBeUndefined()
	})

	it("preserva a hierarquia completa quando o modelo a devolve", () => {
		const saida = RedacaoIaSchema.parse({
			assunto: "Levantamento de contratações",
			paragrafos: [{ texto: "P", itens: [{ texto: "I", alineas: [{ texto: "a", subalineas: [{ texto: "s" }] }] }] }],
		})
		expect(saida.paragrafos[0].itens?.[0].alineas?.[0].subalineas?.[0].texto).toBe("s")
	})

	it("exige ao menos um parágrafo — resposta sem texto não é redação", () => {
		expect(() => RedacaoIaSchema.parse({ paragrafos: [] })).toThrow()
	})
})

describe("data vinda do formulário", () => {
	it("campo de data limpo não datava o documento em 1900", () => {
		// `<input type="date">` limpo devolve "": com o `?? 1` de antes, `new Date(NaN, -1, 1)`
		// virava 1º de janeiro de 1900 e o rascunho gravava isso sem avisar ninguém.
		const hoje = new Date()
		expect(deInputDate("").getFullYear()).toBe(hoje.getFullYear())
		expect(deInputDate("2026-07-03").getDate()).toBe(3)
		expect(deInputDate("2026-07-03").getMonth()).toBe(6)
	})
})
