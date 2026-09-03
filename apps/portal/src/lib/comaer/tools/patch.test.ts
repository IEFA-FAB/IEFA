import { describe, expect, it } from "bun:test"
import { newDocument } from "../draft"
import { toPayload } from "../schema"
import { CHAT_TOOLS, dropModelNulls } from "./definitions"
import { applyPatch, PatchError } from "./patch"

const base = () => ({ ...newDocument(), city: "Brasília", paragraphs: [{ text: "Primeiro." }, { text: "Segundo." }] })

describe("remendos do modelo", () => {
	it("concilia espécie e âmbito em vez de aceitar par impossível", () => {
		const { document } = applyPatch(base(), "set_form", { kind: "oficio-externo", scope: "comaer" })
		expect(document.kind).toBe("oficio-externo")
		expect(document.scope).toBe("externo")
	})

	it("substitui o parágrafo pelo número que o usuário vê no papel", () => {
		const { document } = applyPatch(base(), "replace_paragraph", { number: 2, text: "Reescrito." })
		expect(document.paragraphs.map((p) => p.text)).toEqual(["Primeiro.", "Reescrito."])
	})

	it("insere empurrando os seguintes", () => {
		const { document } = applyPatch(base(), "insert_paragraph", { number: 1, text: "Novo." })
		expect(document.paragraphs.map((p) => p.text)).toEqual(["Novo.", "Primeiro.", "Segundo."])
	})

	it("recusa índice fora do documento com mensagem que o modelo pode corrigir", () => {
		// Erro de remendo volta como erro de tool; a run continua e o modelo tenta de novo.
		expect(() => applyPatch(base(), "replace_paragraph", { number: 9, text: "x" })).toThrow(PatchError)
		expect(() => applyPatch(base(), "replace_paragraph", { number: 9, text: "x" })).toThrow(/2 parágrafo/)
	})

	it("não deixa o documento sem texto", () => {
		const único = { ...newDocument(), paragraphs: [{ text: "Único." }] }
		expect(() => applyPatch(único, "remove_paragraph", { number: 1 })).toThrow(PatchError)
	})

	it("remendo só toca o que veio; o resto do documento fica", () => {
		const antes = { ...base(), subject: "Assunto do usuário", nup: "68000000000202600" }
		const { document } = applyPatch(antes, "set_parties", { recipients: [{ position: "COMGEP" }] })
		expect(document.subject).toBe("Assunto do usuário")
		expect(document.nup).toBe("68000000000202600")
		expect(document.recipients[0].position).toBe("COMGEP")
	})

	it("destinatário sem cargo não apaga o que já existia", () => {
		const antes = { ...base(), recipients: [{ position: "COMGEP", gender: "m" as const }] }
		const { document } = applyPatch(antes, "set_parties", { recipients: [{ position: "  " }] })
		expect(document.recipients).toEqual([{ position: "COMGEP", gender: "m" }])
	})
})

describe("contrato das tools", () => {
	it("nenhuma tool alcança a identidade do documento", () => {
		// Numeração, NUP, OM, localidade, data, ordem do despacho e signatário são do
		// formulário. Este teste quebra se alguém acrescentar um deles a um schema.
		const proibidos = ["numbering", "nup", "om", "city", "date", "despachoOrder", "signer"]
		for (const tool of CHAT_TOOLS) {
			const propriedades = Object.keys((tool.parameters as { properties?: Record<string, unknown> }).properties ?? {})
			for (const proibido of proibidos) expect(propriedades, tool.name).not.toContain(proibido)
		}
	})

	it("toda tool aceita chamada com os opcionais em null", () => {
		// Modelo não omite campo opcional: manda `null`. A poda transforma isso em ausência.
		const args = dropModelNulls({ kind: null, scope: null, classification: null, priority: null, precedence: null, decision: null })
		expect(args).toEqual({})
		const { document } = applyPatch(base(), "set_form", args)
		expect(document.kind).toBe("oficio-comaer")
	})

	it("a poda não desce em array — posição em array é significativa", () => {
		const args = dropModelNulls({ recipients: [{ position: "COMGEP", via: null }] })
		expect(args.recipients).toEqual([{ position: "COMGEP", via: null }])
	})
})

describe("null do modelo dentro de array", () => {
	/**
	 * `dropModelNulls` não desce em array, de propósito: posição em array é significativa.
	 * O `null` aninhado chega inteiro, e `ParteSchema.gender` é `.optional()`, não `.nullish()`.
	 * Copiá-lo como veio gravava `null` no documento: `toPayload` passava a lançar, o salvar
	 * falhava, o rascunho local parava em silêncio e todo turno seguinte ia sem contexto.
	 */
	it("um destinatário com `gender` e `via` nulos ainda produz documento serializável", () => {
		const patch = applyPatch(newDocument(), "set_parties", {
			recipients: [{ position: "Chefe do COMGEP", gender: null, via: null }],
			sender: { position: "Chefe da Divisão de Ensino", gender: null },
		})

		expect(patch.document.recipients[0]).toEqual({ position: "Chefe do COMGEP", gender: undefined, via: undefined })
		expect(() => toPayload(patch.document)).not.toThrow()
	})

	it("gênero fora do enum é descartado em vez de gravado", () => {
		const patch = applyPatch(newDocument(), "set_parties", { recipients: [{ position: "Chefe do COMGEP", gender: "masculino" }] })
		expect(patch.document.recipients[0]?.gender).toBeUndefined()
		expect(() => toPayload(patch.document)).not.toThrow()
	})
})
