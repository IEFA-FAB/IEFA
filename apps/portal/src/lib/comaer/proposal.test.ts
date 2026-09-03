import { describe, expect, it } from "bun:test"
import { reconcileKindAndScope } from "./catalog"
import { newDocument } from "./draft"
import { applyProposal } from "./proposal"
import { AiProposalSchema } from "./schema"
import type { DocumentInput } from "./types"

function document(over: Partial<DocumentInput> = {}): DocumentInput {
	return {
		...newDocument(),
		om: { name: "Instituto de Economia e Finanças da Aeronáutica", acronym: "IEFA" },
		numbering: { sequence: 34, sector: "GAB", organizationNumber: "255" },
		nup: "68000000000202600",
		city: "Brasília",
		subject: "Assunto digitado pelo usuário",
		signer: { name: "Fulano de Tal", rank: "Cel", quadro: "Int", position: "Diretor", om: "IEFA" },
		...over,
	}
}

/** Só a forma e o texto vêm do modelo; o resto é do formulário. */
const buildProposal = (parcial: Record<string, unknown>) => AiProposalSchema.parse({ paragraphs: [{ text: "Texto do modelo." }], ...parcial })

describe("espécie × âmbito", () => {
	it("aceita o par sugerido quando a norma o admite", () => {
		expect(reconcileKindAndScope({ kind: "oficio-comaer", scope: "comaer" }, { kind: "requerimento", scope: "interno-om" })).toEqual({
			kind: "requerimento",
			scope: "interno-om",
		})
	})

	it("puxa o âmbito para um que comporte a espécie em vez de aceitar par impossível", () => {
		// Ofício externo dentro do COMAER renderizaria fecho de cortesia onde o art. 30 o
		// proíbe — é justamente o que o catálogo existe para impedir.
		expect(reconcileKindAndScope({ kind: "oficio-comaer", scope: "comaer" }, { kind: "oficio-externo", scope: "comaer" })).toEqual({
			kind: "oficio-externo",
			scope: "externo",
		})
	})

	it("ignora espécie que não existe no catálogo", () => {
		expect(reconcileKindAndScope({ kind: "oficio-comaer", scope: "comaer" }, { kind: "mensagem-telegrafica" })).toEqual({
			kind: "oficio-comaer",
			scope: "comaer",
		})
	})
})

describe("aplicação da proposta do modelo", () => {
	it("não toca na identidade do documento", () => {
		// Numeração, NUP, OM, localidade, data e signatário não estão no schema da IA. Este
		// teste é o que denuncia alguém tê-los acrescentado sem pensar duas vezes.
		const before = document()
		const after = applyProposal(before, buildProposal({ kind: "requerimento", scope: "interno-om" }))
		expect(after.numbering).toEqual(before.numbering)
		expect(after.nup).toBe(before.nup)
		expect(after.om).toEqual(before.om)
		expect(after.city).toBe(before.city)
		expect(after.date).toEqual(before.date)
		expect(after.signer).toEqual(before.signer)
	})

	it("preserva o que o usuário digitou e o modelo não devolveu", () => {
		const after = applyProposal(document({ references: ["Ofício nº 1/GAB/2"] }), buildProposal({}))
		expect(after.subject).toBe("Assunto digitado pelo usuário")
		expect(after.references).toEqual(["Ofício nº 1/GAB/2"])
	})

	it("aplica forma, partes e precedência quando vêm na proposta", () => {
		const after = applyProposal(
			document(),
			buildProposal({
				kind: "oficio-externo",
				scope: "externo",
				precedence: "superior",
				priority: "urgente",
				recipients: [{ position: "Presidente do Tribunal de Contas da União", gender: "m", via: null }],
				addressing: { formOfAddress: "excelencia", gender: "m", name: "Fulano de Tal", position: null, addressLines: null },
				vocativo: "Senhor Presidente,",
			})
		)
		expect(after.kind).toBe("oficio-externo")
		expect(after.scope).toBe("externo")
		expect(after.precedence).toBe("superior")
		expect(after.priority).toBe("urgente")
		expect(after.recipients[0].position).toBe("Presidente do Tribunal de Contas da União")
		expect(after.addressing?.formOfAddress).toBe("excelencia")
		expect(after.vocativo).toBe("Senhor Presidente,")
	})

	it("endereçamento parcial não zera o que já estava escolhido", () => {
		const before = document({ addressing: { formOfAddress: "excelencia", gender: "f", name: "Fulana", position: "Juíza" } })
		const after = applyProposal(
			before,
			buildProposal({ addressing: { name: "Beltrana", formOfAddress: null, gender: null, position: null, addressLines: null } })
		)
		expect(after.addressing).toEqual({ formOfAddress: "excelencia", gender: "f", name: "Beltrana", position: "Juíza", addressLines: undefined })
	})

	it("destinatário sem cargo não substitui o que já existe", () => {
		const before = document({ recipients: [{ position: "COMGEP", gender: "m" }] })
		const after = applyProposal(before, buildProposal({ recipients: [{ position: "  ", gender: null, via: null }] }))
		expect(after.recipients).toEqual([{ position: "COMGEP", gender: "m" }])
	})
})

describe("marcador de preenchimento devolvido pelo modelo", () => {
	it("descarta placeholder em vez de imprimi-lo no documento", () => {
		// `<UNKNOWN>` no nome do destinatário foi o que o modelo mandou de fato num ofício a
		// juiz federal — e placeholder impresso é copiado para o SIGADAER sem ninguém ver.
		const proposal = AiProposalSchema.parse({
			paragraphs: [{ text: "Texto." }],
			subject: "<ASSUNTO>",
			vocativo: "[vocativo]",
			addressing: {
				name: "<UNKNOWN>",
				position: "Juiz Federal da 10ª Vara",
				formOfAddress: "excelencia",
				gender: "m",
				addressLines: ["XXXXX", "São Paulo - SP"],
			},
			recipients: [
				{ position: "N/A", gender: null, via: null },
				{ position: "COMGEP", gender: "m", via: null },
			],
		})
		expect(proposal.subject).toBeUndefined()
		expect(proposal.vocativo).toBeUndefined()
		expect(proposal.addressing?.name).toBeUndefined()
		expect(proposal.addressing?.position).toBe("Juiz Federal da 10ª Vara")
		expect(proposal.addressing?.addressLines).toEqual(["São Paulo - SP"])
		expect(proposal.recipients).toEqual([{ position: "COMGEP", gender: "m", via: undefined }])
	})

	it("não confunde texto legítimo com marcador", () => {
		const proposal = AiProposalSchema.parse({ paragraphs: [{ text: "Texto." }], subject: "Prestação de informações", vocativo: "Senhor Juiz," })
		expect(proposal.subject).toBe("Prestação de informações")
		expect(proposal.vocativo).toBe("Senhor Juiz,")
	})
})
