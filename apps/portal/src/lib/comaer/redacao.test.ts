import { describe, expect, it } from "bun:test"
import { conciliarEspecieAmbito } from "./especies"
import { rascunhoInicial } from "./rascunho"
import { aplicarRedacao } from "./redacao"
import { RedacaoIaSchema } from "./schema"
import type { DocumentoInput } from "./tipos"

function documento(over: Partial<DocumentoInput> = {}): DocumentoInput {
	return {
		...rascunhoInicial(),
		om: { nome: "Instituto de Economia e Finanças da Aeronáutica", sigla: "IEFA" },
		numeracao: { sequencial: 34, setor: "GAB", ordemGeral: "255" },
		nup: "68000000000202600",
		localidade: "Brasília",
		assunto: "Assunto digitado pelo usuário",
		signatario: { nome: "Fulano de Tal", posto: "Cel", quadro: "Int", cargo: "Diretor", om: "IEFA" },
		...over,
	}
}

/** Só a forma e o texto vêm do modelo; o resto é do formulário. */
const proposta = (parcial: Record<string, unknown>) => RedacaoIaSchema.parse({ paragrafos: [{ texto: "Texto do modelo." }], ...parcial })

describe("espécie × âmbito", () => {
	it("aceita o par sugerido quando a norma o admite", () => {
		expect(conciliarEspecieAmbito({ especie: "oficio-comaer", ambito: "comaer" }, { especie: "requerimento", ambito: "interno-om" })).toEqual({
			especie: "requerimento",
			ambito: "interno-om",
		})
	})

	it("puxa o âmbito para um que comporte a espécie em vez de aceitar par impossível", () => {
		// Ofício externo dentro do COMAER renderizaria fecho de cortesia onde o art. 30 o
		// proíbe — é justamente o que o catálogo existe para impedir.
		expect(conciliarEspecieAmbito({ especie: "oficio-comaer", ambito: "comaer" }, { especie: "oficio-externo", ambito: "comaer" })).toEqual({
			especie: "oficio-externo",
			ambito: "externo",
		})
	})

	it("ignora espécie que não existe no catálogo", () => {
		expect(conciliarEspecieAmbito({ especie: "oficio-comaer", ambito: "comaer" }, { especie: "mensagem-telegrafica" })).toEqual({
			especie: "oficio-comaer",
			ambito: "comaer",
		})
	})
})

describe("aplicação da proposta do modelo", () => {
	it("não toca na identidade do documento", () => {
		// Numeração, NUP, OM, localidade, data e signatário não estão no schema da IA. Este
		// teste é o que denuncia alguém tê-los acrescentado sem pensar duas vezes.
		const antes = documento()
		const depois = aplicarRedacao(antes, proposta({ especie: "requerimento", ambito: "interno-om" }))
		expect(depois.numeracao).toEqual(antes.numeracao)
		expect(depois.nup).toBe(antes.nup)
		expect(depois.om).toEqual(antes.om)
		expect(depois.localidade).toBe(antes.localidade)
		expect(depois.data).toEqual(antes.data)
		expect(depois.signatario).toEqual(antes.signatario)
	})

	it("preserva o que o usuário digitou e o modelo não devolveu", () => {
		const depois = aplicarRedacao(documento({ referencias: ["Ofício nº 1/GAB/2"] }), proposta({}))
		expect(depois.assunto).toBe("Assunto digitado pelo usuário")
		expect(depois.referencias).toEqual(["Ofício nº 1/GAB/2"])
	})

	it("aplica forma, partes e precedência quando vêm na proposta", () => {
		const depois = aplicarRedacao(
			documento(),
			proposta({
				especie: "oficio-externo",
				ambito: "externo",
				precedencia: "superior",
				prioridade: "urgente",
				destinatarios: [{ cargo: "Presidente do Tribunal de Contas da União", genero: "m", via: null }],
				enderecamento: { tratamento: "excelencia", genero: "m", nome: "Fulano de Tal", cargo: null, linhasEndereco: null },
				vocativo: "Senhor Presidente,",
			})
		)
		expect(depois.especie).toBe("oficio-externo")
		expect(depois.ambito).toBe("externo")
		expect(depois.precedencia).toBe("superior")
		expect(depois.prioridade).toBe("urgente")
		expect(depois.destinatarios[0].cargo).toBe("Presidente do Tribunal de Contas da União")
		expect(depois.enderecamento?.tratamento).toBe("excelencia")
		expect(depois.vocativo).toBe("Senhor Presidente,")
	})

	it("endereçamento parcial não zera o que já estava escolhido", () => {
		const antes = documento({ enderecamento: { tratamento: "excelencia", genero: "f", nome: "Fulana", cargo: "Juíza" } })
		const depois = aplicarRedacao(antes, proposta({ enderecamento: { nome: "Beltrana", tratamento: null, genero: null, cargo: null, linhasEndereco: null } }))
		expect(depois.enderecamento).toEqual({ tratamento: "excelencia", genero: "f", nome: "Beltrana", cargo: "Juíza", linhasEndereco: undefined })
	})

	it("destinatário sem cargo não substitui o que já existe", () => {
		const antes = documento({ destinatarios: [{ cargo: "COMGEP", genero: "m" }] })
		const depois = aplicarRedacao(antes, proposta({ destinatarios: [{ cargo: "  ", genero: null, via: null }] }))
		expect(depois.destinatarios).toEqual([{ cargo: "COMGEP", genero: "m" }])
	})
})

describe("marcador de preenchimento devolvido pelo modelo", () => {
	it("descarta placeholder em vez de imprimi-lo no documento", () => {
		// `<UNKNOWN>` no nome do destinatário foi o que o modelo mandou de fato num ofício a
		// juiz federal — e placeholder impresso é copiado para o SIGADAER sem ninguém ver.
		const redacao = RedacaoIaSchema.parse({
			paragrafos: [{ texto: "Texto." }],
			assunto: "<ASSUNTO>",
			vocativo: "[vocativo]",
			enderecamento: {
				nome: "<UNKNOWN>",
				cargo: "Juiz Federal da 10ª Vara",
				tratamento: "excelencia",
				genero: "m",
				linhasEndereco: ["XXXXX", "São Paulo - SP"],
			},
			destinatarios: [
				{ cargo: "N/A", genero: null, via: null },
				{ cargo: "COMGEP", genero: "m", via: null },
			],
		})
		expect(redacao.assunto).toBeUndefined()
		expect(redacao.vocativo).toBeUndefined()
		expect(redacao.enderecamento?.nome).toBeUndefined()
		expect(redacao.enderecamento?.cargo).toBe("Juiz Federal da 10ª Vara")
		expect(redacao.enderecamento?.linhasEndereco).toEqual(["São Paulo - SP"])
		expect(redacao.destinatarios).toEqual([{ cargo: "COMGEP", genero: "m", via: undefined }])
	})

	it("não confunde texto legítimo com marcador", () => {
		const redacao = RedacaoIaSchema.parse({ paragrafos: [{ texto: "Texto." }], assunto: "Prestação de informações", vocativo: "Senhor Juiz," })
		expect(redacao.assunto).toBe("Prestação de informações")
		expect(redacao.vocativo).toBe("Senhor Juiz,")
	})
})
