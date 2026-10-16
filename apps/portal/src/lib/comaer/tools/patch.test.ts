import { describe, expect, it } from "bun:test"
import { newDocument } from "../draft"
import { toPayload } from "../schema"
import { CHAT_TOOLS, dropModelNulls } from "./definitions"
import { applyPatch, PatchError, printedOutline } from "./patch"

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

	it("recusa tratamento que a norma proíbe, em vez de gravar o texto e avisar depois", () => {
		// O modelo lê o erro e reescreve no turno seguinte. Limpar a expressão em silêncio
		// deixaria a frase sem concordância ("solicito a Senhor que") e ele não saberia do erro.
		expect(() => applyPatch(base(), "write_body", { paragraphs: [{ text: "Solicito a Vossa Senhoria autorização." }] })).toThrow(PatchError)
		expect(() => applyPatch(base(), "replace_paragraph", { number: 1, text: "Informo a V. Sª o resultado." })).toThrow(/Senhor/)
		expect(() => applyPatch(base(), "insert_paragraph", { number: 1, text: "Ao Ilustríssimo Senhor Diretor." })).toThrow(PatchError)
	})

	it("a proibição desce aos itens e alíneas, não só ao parágrafo", () => {
		const args = { paragraphs: [{ text: "Solicito o seguinte:", items: [{ text: "encaminhar a Vossa Senhoria o processo;" }] }] }
		expect(() => applyPatch(base(), "write_body", args)).toThrow(PatchError)
	})

	it("no âmbito externo a forma de tratamento é escolha do formulário, e o remendo passa", () => {
		const externo = { ...base(), kind: "oficio-externo" as const, scope: "externo" as const }
		const { document } = applyPatch(externo, "write_body", { paragraphs: [{ text: "Solicito a Vossa Excelência a designação de perito." }] })
		expect(document.paragraphs[0].text).toContain("Vossa Excelência")
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
		const args = dropModelNulls({ kind: null, scope: null, classification: null, precedence: null, decision: null })
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

describe("numeração impressa no resumo", () => {
	it("devolve ao modelo a numeração que a folha vai imprimir", () => {
		const doc = {
			...newDocument(),
			kind: "oficio-comaer",
			paragraphs: [{ text: "Um." }, { text: "Dois:", items: [{ text: "item", alineas: [{ text: "x" }, { text: "y" }] }, { text: "outro" }] }],
		}
		expect(printedOutline(doc)).toBe("1; 2 (2.1 [a), b)], 2.2)")
	})

	it("avisa a numeração nova quando a troca de espécie a muda", () => {
		const { summary } = applyPatch({ ...base(), kind: "oficio-comaer" }, "set_form", { kind: "carta" })
		expect(summary).toContain("Numeração impressa agora: (sem número); (sem número)")
	})

	it("diz quando a espécie não numera parágrafo", () => {
		expect(printedOutline({ ...newDocument(), kind: "carta", paragraphs: [{ text: "A" }, { text: "B" }] })).toBe("(sem número); (sem número)")
	})
})

describe("cada remendo: resumo, blocos tocados e recusas", () => {
	it("remendo desconhecido é recusado, inclusive nome que existe em Object.prototype", () => {
		expect(() => applyPatch(base(), "set_nup", {})).toThrow("Remendo desconhecido: set_nup")
		expect(() => applyPatch(base(), "toString", {})).toThrow("Remendo desconhecido: toString")
		expect(() => applyPatch(base(), "__proto__", {})).toThrow("Remendo desconhecido: __proto__")
	})

	it("set_form: opcionais ausentes mantêm o documento; sem texto, o resumo é só a forma", () => {
		const doc = { ...base(), paragraphs: [{ text: " " }], classification: "reservado" as const, precedence: "superior" as const, decision: "DEFERIDO" as const }
		const patch = applyPatch(doc, "set_form", {})
		expect(patch.summary).toBe("Forma: oficio-comaer, âmbito comaer.")
		expect(patch.touched).toEqual(["epigrafe", "numeracao", "fecho"])
		expect([patch.document.classification, patch.document.precedence, patch.document.decision]).toEqual(["reservado", "superior", "DEFERIDO"])
		const changed = applyPatch(doc, "set_form", { classification: "ostensivo", precedence: "igual", decision: "ARQUIVE-SE" }).document
		expect([changed.classification, changed.precedence, changed.decision]).toEqual(["ostensivo", "igual", "ARQUIVE-SE"])
	})

	it("set_parties: remetente, endereçamento mesclado, vocativo e distribuição", () => {
		const doc = {
			...base(),
			sender: { position: "Chefe", gender: "f" as const },
			addressing: { formOfAddress: "excelencia" as const, gender: "f" as const, name: "Maria", position: "Prefeita", addressLines: ["Rua A"] },
			vocativo: "Senhora Prefeita",
		}
		const patch = applyPatch(doc, "set_parties", { sender: { position: "Diretor" }, addressing: { name: "Ana" }, distribution: "circular" })
		expect(patch.summary).toBe("Partes atualizadas.")
		expect(patch.touched).toEqual(["preambulo", "enderecamento", "vocativo"])
		expect(patch.document.sender).toEqual({ position: "Diretor", gender: "f" })
		expect(patch.document.addressing).toEqual({ formOfAddress: "excelencia", gender: "f", name: "Ana", position: "Prefeita", addressLines: ["Rua A"] })
		expect(patch.document.vocativo).toBe("Senhora Prefeita")
		expect(patch.document.distribution).toBe("circular")
		expect(patch.document.recipients).toEqual(doc.recipients)
	})

	it("set_parties: endereçamento novo sem anterior usa senhoria e masculino; remetente em branco não apaga", () => {
		const doc = { ...base(), addressing: undefined, sender: { position: "Chefe", gender: "m" as const } }
		const patch = applyPatch(doc, "set_parties", { addressing: {}, sender: { position: "  ", gender: "f" }, vocativo: "Senhor" })
		expect(patch.document.addressing).toEqual({ formOfAddress: "senhoria", gender: "m", name: undefined, position: undefined, addressLines: undefined })
		expect(patch.document.sender).toEqual({ position: "Chefe", gender: "m" })
		expect(patch.document.vocativo).toBe("Senhor")
		const viaKept = applyPatch(doc, "set_parties", { recipients: [{ position: "A", gender: "f", via: "Via B" }, { position: 3 }] }).document.recipients
		expect(viaKept).toEqual([{ position: "A", gender: "f", via: "Via B" }])
		expect(applyPatch(doc, "set_parties", { sender: { position: "Novo", gender: "f" } }).document.sender).toEqual({ position: "Novo", gender: "f" })
		expect(applyPatch(doc, "set_parties", { sender: null }).document.sender).toEqual({ position: "Chefe", gender: "m" })
	})

	it("set_parties: destinatário, difusão e endereçamento fora do tipo são erro de remendo", () => {
		// `null` dentro de array escapa da poda do boundary; ler `.position` dele lançava TypeError,
		// e `distribution`/`addressing` entravam no documento por cast, como viessem.
		const cases: [Record<string, unknown>, string][] = [
			[{ recipients: [null] }, "Cada destinatário precisa ser um objeto com `position`."],
			[{ recipients: ["Chefe do COMGEP"] }, "Cada destinatário precisa ser um objeto com `position`."],
			[{ recipients: "x" }, "O campo `recipients` precisa ser uma lista de destinatários."],
			[{ distribution: "geral" }, "O campo `distribution` aceita só: circular, difral."],
			[{ distribution: 1 }, "O campo `distribution` aceita só: circular, difral."],
			[{ addressing: [] }, "O campo `addressing` precisa ser um objeto."],
			[{ addressing: { addressLines: [null] } }, "O campo `addressing.addressLines` precisa ser uma lista de textos."],
			[{ addressing: { addressLines: "Rua A" } }, "O campo `addressing.addressLines` precisa ser uma lista de textos."],
			[{ addressing: { formOfAddress: "magnificencia" } }, "O campo `addressing.formOfAddress` aceita só: excelencia, senhoria."],
			[{ addressing: { gender: "x" } }, "O campo `addressing.gender` aceita só: m, f."],
			[{ addressing: { name: 1 } }, "O campo `addressing.name` precisa ser texto."],
			[{ vocativo: 1 }, "O campo `vocativo` precisa ser texto."],
		]
		for (const [args, message] of cases) {
			expect(() => applyPatch(base(), "set_parties", args)).toThrow(PatchError)
			expect(() => applyPatch(base(), "set_parties", args)).toThrow(message)
		}
		const ok = applyPatch(base(), "set_parties", { distribution: "difral", addressing: { addressLines: ["Rua A", "Brasília"] } }).document
		expect([ok.distribution, ok.addressing?.addressLines]).toEqual(["difral", ["Rua A", "Brasília"]])
		expect(() => toPayload(ok)).not.toThrow()
	})

	it("set_ementa: referências, anexos e assunto fora do tipo são erro de remendo", () => {
		const cases: [Record<string, unknown>, string][] = [
			[{ references: [null] }, "O campo `references` precisa ser uma lista de textos."],
			[{ references: "Ref 1" }, "O campo `references` precisa ser uma lista de textos."],
			[{ annexes: [null, "B"] }, "O campo `annexes` precisa ser uma lista de textos."],
			[{ annexes: { a: 1 } }, "O campo `annexes` precisa ser uma lista de textos."],
			[{ subject: ["Assunto"] }, "O campo `subject` precisa ser texto."],
		]
		for (const [args, message] of cases) {
			expect(() => applyPatch(base(), "set_ementa", args)).toThrow(PatchError)
			expect(() => applyPatch(base(), "set_ementa", args)).toThrow(message)
		}
	})

	it("set_ementa: troca o que veio e mantém o resto", () => {
		const doc = { ...base(), subject: "Antigo", references: ["Ref 1"], annexes: ["Anexo 1"] }
		const patch = applyPatch(doc, "set_ementa", { subject: "Novo" })
		expect(patch).toMatchObject({ summary: "Ementa atualizada.", touched: ["ementa"] })
		expect([patch.document.subject, patch.document.references, patch.document.annexes]).toEqual(["Novo", ["Ref 1"], ["Anexo 1"]])
		const all = applyPatch(doc, "set_ementa", { references: [], annexes: ["B"] }).document
		expect([all.subject, all.references, all.annexes]).toEqual(["Antigo", [], ["B"]])
	})

	it("write_body: lista obrigatória, não vazia, cada parágrafo com texto", () => {
		expect(() => applyPatch(base(), "write_body", { paragraphs: "x" })).toThrow("O campo `paragraphs` precisa ser uma lista de parágrafos.")
		expect(() => applyPatch(base(), "write_body", { paragraphs: [] })).toThrow("O texto precisa de ao menos um parágrafo.")
		expect(() => applyPatch(base(), "write_body", { paragraphs: [{ text: 1 }] })).toThrow("Cada parágrafo precisa de `text`.")
		expect(() => applyPatch(base(), "write_body", { paragraphs: [{ text: "a", items: [{}] }] })).toThrow("Cada item precisa de `text`.")
		expect(() => applyPatch(base(), "write_body", { paragraphs: [{ text: "a", items: [{ text: "b", alineas: [{}] }] }] })).toThrow(
			"Cada alínea precisa de `text`."
		)
		const patch = applyPatch(base(), "write_body", { paragraphs: [{ text: "Um." }, { text: "Dois." }] })
		expect(patch).toMatchObject({ summary: "Texto reescrito com 2 parágrafo(s). Numeração impressa agora: 1; 2.", touched: ["texto"] })
	})

	it("write_body: `null` dentro das listas é erro de remendo, não TypeError", () => {
		// `null` dentro de array escapa da poda do boundary; ler `.text` dele lançava TypeError.
		const cases: [unknown, string][] = [
			[[null], "Cada parágrafo precisa de `text`."],
			[["texto solto"], "Cada parágrafo precisa de `text`."],
			[[{ text: "a", items: [null] }], "Cada item precisa de `text`."],
			[[{ text: "a", items: [{ text: "b", alineas: [null] }] }], "Cada alínea precisa de `text`."],
		]
		for (const [paragraphs, message] of cases) {
			expect(() => applyPatch(base(), "write_body", { paragraphs })).toThrow(PatchError)
			expect(() => applyPatch(base(), "write_body", { paragraphs })).toThrow(message)
		}
	})

	it("replace, insert e remove: resumo com a posição e a numeração; limites do índice", () => {
		expect(applyPatch(base(), "replace_paragraph", { number: 1, text: "X." }).summary).toBe("Parágrafo 1 substituído. Numeração impressa agora: 1; 2.")
		expect(applyPatch(base(), "insert_paragraph", { number: 3, text: "Fim." }).summary).toBe(
			"Parágrafo inserido na posição 3. Numeração impressa agora: 1; 2; 3."
		)
		const removed = applyPatch(base(), "remove_paragraph", { number: 2 })
		expect(removed).toMatchObject({ summary: "Parágrafo 2 removido. Numeração impressa agora: (sem número).", touched: ["texto"] })
		expect(removed.document.paragraphs).toEqual([{ text: "Primeiro." }])
		expect(() => applyPatch(base(), "insert_paragraph", { number: 4, text: "x" })).toThrow("Parágrafo 4 não existe. O documento tem 2 parágrafo(s).")
		expect(() => applyPatch(base(), "replace_paragraph", { number: "1", text: "x" })).toThrow("Parágrafo 1 não existe.")
		expect(() => applyPatch(base(), "remove_paragraph", { number: 1.5 })).toThrow(PatchError)
		expect(() => applyPatch(base(), "replace_paragraph", { number: 1 })).toThrow("Cada parágrafo precisa de `text`.")
	})
})
