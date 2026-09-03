import { beforeEach, describe, expect, it } from "bun:test"
import { DRAFT_KEY, documentDraftKey, fromDateInputValue, hasContent, isDirty, loadDraft, newDocument, saveDraft } from "./draft"
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

describe("rascunho gravado por outra versão do formato", () => {
	/**
	 * O erro que isto fecha: "Cannot read properties of undefined (reading 'trim')". Um
	 * rascunho gravado antes da renomeação volta com `localidade`/`especie`; o campo novo
	 * chega `undefined` e a montagem morre no primeiro `city.trim()`, com a tela em branco
	 * e longe da causa.
	 */
	const armazenamento = new Map<string, string>()
	const localStorageFalso = {
		getItem: (k: string) => armazenamento.get(k) ?? null,
		setItem: (k: string, v: string) => void armazenamento.set(k, v),
		removeItem: (k: string) => void armazenamento.delete(k),
	}

	beforeEach(() => {
		armazenamento.clear()
		;(globalThis as { localStorage?: unknown }).localStorage = localStorageFalso
	})

	it("descarta o rascunho em formato antigo em vez de devolvê-lo pela metade", () => {
		armazenamento.set(
			DRAFT_KEY,
			JSON.stringify({ especie: "oficio-comaer", ambito: "comaer", sigilo: "ostensivo", localidade: "Brasília", data: new Date().toISOString() })
		)
		expect(loadDraft()).toBeNull()
		expect(armazenamento.has(DRAFT_KEY)).toBe(false)
	})

	it("apaga a chave da versão anterior ao ler", () => {
		armazenamento.set("iefa.comaer.rascunho.v1", JSON.stringify({ especie: "oficio-comaer" }))
		expect(loadDraft()).toBeNull()
		expect(armazenamento.has("iefa.comaer.rascunho.v1")).toBe(false)
	})

	it("devolve o rascunho quando o formato confere, com a data reidratada", () => {
		saveDraft({ ...newDocument(), city: "Rio de Janeiro", date: new Date(2026, 6, 3) })
		const loaded = loadDraft()
		expect(loaded?.city).toBe("Rio de Janeiro")
		expect(loaded?.date).toBeInstanceOf(Date)
		expect(loaded?.date.getDate()).toBe(3)
	})

	it("conteúdo corrompido não derruba a tela", () => {
		armazenamento.set(DRAFT_KEY, "{ isto não é json")
		expect(loadDraft()).toBeNull()
	})
})

describe("rascunho de documento salvo", () => {
	/**
	 * O documento novo tinha rede; o salvo não tinha nenhuma. Vinte minutos de reescrita
	 * viviam só em memória, e um F5 devolvia a versão do banco sem avisar.
	 */
	it("guarda e devolve o rascunho por documento, sem misturar com o do documento novo", () => {
		const doc = { ...newDocument(), subject: "Documento salvo", city: "Recife" }
		saveDraft({ ...newDocument(), subject: "Rascunho novo" })
		saveDraft(doc, documentDraftKey("11111111-1111-4111-8111-111111111111"))

		expect(loadDraft()?.subject).toBe("Rascunho novo")
		expect(loadDraft(documentDraftKey("11111111-1111-4111-8111-111111111111"))?.subject).toBe("Documento salvo")
	})

	it("sabe dizer se há alteração não salva", () => {
		const saved = { ...newDocument(), subject: "Como está no banco" }
		expect(isDirty(saved, saved)).toBe(false)
		expect(isDirty({ ...saved, subject: "Editado agora" }, saved)).toBe(true)
		// Documento novo não tem base de comparação: não existe "não salvo" a apontar.
		expect(isDirty(saved, null)).toBe(false)
	})
})

describe("o que vale guardar", () => {
	it("documento só com identidade do perfil não vira rascunho", () => {
		// Abrir "Novo documento" e voltar deixava um cartão vazio na biblioteca, que a pessoa
		// tinha de descartar sem nunca ter digitado nada.
		const seeded = { ...newDocument(), om: { ...newDocument().om, name: "BAAN" }, city: "Anápolis" }
		expect(hasContent(seeded)).toBe(false)
		expect(hasContent({ ...seeded, subject: "Prorrogação" })).toBe(true)
		expect(hasContent({ ...seeded, paragraphs: [{ text: "Solicito." }] })).toBe(true)
	})
})
