import { describe, expect, it } from "bun:test"
import { buscarEspecie, ESPECIES } from "./especies"
import { montarDocumento } from "./montar"
import { camposParaCopia, paraHtml, paraTextoPlano } from "./sigadaer"
import type { DocumentoInput } from "./tipos"

function base(over: Partial<DocumentoInput> = {}): DocumentoInput {
	return {
		especie: "oficio-comaer",
		ambito: "comaer",
		sigilo: "ostensivo",
		om: { nome: "Instituto de Economia e Finanças da Aeronáutica", sigla: "IEFA" },
		numeracao: { sequencial: 34, setor: "GAB", ordemGeral: "255" },
		nup: "68000000000202600",
		localidade: "Brasília",
		data: new Date(2026, 6, 3),
		remetente: { cargo: "Diretor do Instituto de Economia e Finanças da Aeronáutica" },
		destinatarios: [{ cargo: "Comandante-Geral do Pessoal" }],
		assunto: "Alteração de período de férias",
		paragrafos: [{ texto: "Trata-se de alteração de período de férias." }, { texto: "Solicita-se providência." }],
		signatario: { nome: "Fulano de Tal", posto: "Cel", quadro: "Int", cargo: "Diretor", om: "IEFA" },
		...over,
	}
}

describe("catálogo de espécies", () => {
	it("toda espécie declara texto, signatário e o artigo que a fundamenta", () => {
		for (const e of ESPECIES) {
			expect(e.blocos, e.id).toContain("texto")
			expect(e.blocos, e.id).toContain("signatario")
			expect(e.fundamento, e.id).toMatch(/art\. \d+/)
		}
	})

	it("só espécie de âmbito externo pode ter fecho de cortesia (art. 30)", () => {
		// O inverso é o que a norma proíbe: fecho em documento que circula dentro do COMAER.
		for (const e of ESPECIES) {
			if (e.permiteFecho) expect(e.ambitos, e.id).toContain("externo")
			if (!e.ambitos.includes("externo")) expect(e.permiteFecho, e.id).toBe(false)
		}
	})

	it("declara bloco de fecho apenas quando o permite", () => {
		for (const e of ESPECIES) {
			if (e.blocos.includes("fecho")) expect(e.permiteFecho, e.id).toBe(true)
		}
	})
})

describe("montagem do documento", () => {
	it("o ofício entre OM do COMAER não recebe fecho de cortesia", () => {
		const doc = montarDocumento(base({ precedencia: "superior" }))
		expect(doc.blocos.map((b) => b.id)).not.toContain("fecho")
	})

	it("o ofício externo recebe endereçamento, vocativo e fecho", () => {
		const doc = montarDocumento(
			base({
				especie: "oficio-externo",
				ambito: "externo",
				precedencia: "superior",
				enderecamento: { tratamento: "excelencia", genero: "m", nome: "Fulano de Tal", cargo: "Juiz de Direito da 10ª Vara Cível" },
				remetente: undefined,
				destinatarios: [],
			})
		)
		const ids = doc.blocos.map((b) => b.id)
		expect(ids).toContain("enderecamento")
		expect(ids).toContain("vocativo")
		expect(doc.blocos.find((b) => b.id === "fecho")?.linhas[0].texto).toBe("Respeitosamente,")
		expect(doc.blocos.find((b) => b.id === "enderecamento")?.linhas[0].texto).toBe("A Sua Excelência o Senhor")
	})

	it("põe localidade e data na linha da numeração, e no requerimento na linha do NUP", () => {
		expect(montarDocumento(base()).blocos.find((b) => b.id === "numeracao")?.linhas[0].mesmaLinhaDireita).toBe("Brasília, 3 de julho de 2026.")
		const req = montarDocumento(base({ especie: "requerimento" }))
		expect(req.blocos.find((b) => b.id === "nup")?.linhas[0].mesmaLinhaDireita).toBe("Brasília, 3 de julho de 2026.")
		expect(req.blocos.map((b) => b.id)).not.toContain("numeracao")
	})

	it("o ofício de interesse particular identifica o signatário pelo nome e omite o cargo (art. 51 § 7º)", () => {
		const doc = montarDocumento(base({ especie: "oficio-particular", numeracao: { sequencial: null } }))
		expect(doc.blocos.find((b) => b.id === "preambulo")?.linhas[0].texto).toBe("Do Cel Int FULANO DE TAL")
		expect(doc.blocos.find((b) => b.id === "signatario")?.linhas.map((l) => l.texto)).toEqual(["FULANO DE TAL Cel Int"])
	})

	it("o despacho decisório abre o texto pela decisão em caixa alta (art. 49 § 2º, III)", () => {
		const doc = montarDocumento(
			base({ especie: "despacho-decisorio", decisao: "DEFERIDO", paragrafos: [{ texto: "de acordo com o art. 5º das Instruções Gerais." }] })
		)
		expect(doc.blocos.find((b) => b.id === "texto")?.linhas[0].texto).toBe("DEFERIDO, de acordo com o art. 5º das Instruções Gerais.")
	})

	it("a certidão leva a numeração no próprio título (art. 46 § 4º, III)", () => {
		const doc = montarDocumento(
			base({ especie: "certidao", ambito: "externo", paragrafos: [{ texto: "Certifico, para fins de comprovação de tempo de serviço." }] })
		)
		expect(doc.blocos.find((b) => b.id === "titulo")?.linhas[0].texto).toBe("CERTIDÃO nº 34/GAB/255")
	})
})

describe("conferência de conformidade", () => {
	it("acusa NUP ausente ou incompleto", () => {
		expect(montarDocumento(base({ nup: undefined })).avisos.join(" ")).toContain("NUP")
		expect(montarDocumento(base({ nup: "680" })).avisos.join(" ")).toContain("NUP")
		expect(montarDocumento(base()).avisos.join(" ")).not.toContain("NUP")
	})

	it("acusa documento por ordem sem a abertura obrigatória (art. 40 § 9º)", () => {
		const semAbertura = montarDocumento(base({ signatario: { ...base().signatario, porOrdemDe: "Comandante-Geral de Apoio" } }))
		expect(semAbertura.avisos.join(" ")).toContain("Por ordem")

		const comAbertura = montarDocumento(
			base({
				signatario: { ...base().signatario, porOrdemDe: "Comandante-Geral de Apoio" },
				paragrafos: [{ texto: "Por ordem do Comandante-Geral de Apoio, informo que…" }],
			})
		)
		expect(comAbertura.avisos.join(" ")).not.toContain("Por ordem")
	})

	it("acusa ofício circular endereçado ao CMTAER (art. 51 § 8º, IV)", () => {
		const doc = montarDocumento(base({ difusao: "circular", destinatarios: [{ cargo: "CMTAER" }, { cargo: "COMGEP" }] }))
		expect(doc.avisos.join(" ")).toContain("CMTAER")
	})

	it("acusa referência e anexo na ementa do ofício externo (art. 51 § 9º, IX)", () => {
		const doc = montarDocumento(
			base({ especie: "oficio-externo", ambito: "externo", referencias: ["Ofício nº 1/GAB/2"], remetente: undefined, destinatarios: [] })
		)
		expect(doc.avisos.join(" ")).toContain("referências e anexos são citados no texto")
	})
})

describe("saída para o SIGADAER", () => {
	const doc = montarDocumento(base())

	it("gera HTML sem class, sem style e sem div — o que o sanitizador do editor destruiria", () => {
		const html = paraHtml(doc)
		expect(html).not.toMatch(/class=|style=|<div/)
		expect(html).toMatch(/^<p>/)
	})

	it("mantém a numeração dos parágrafos como texto, não como lista HTML", () => {
		// `<ol>` deixaria o editor renumerar sozinho, e 1.1 / a) / - não são lista HTML.
		expect(paraHtml(doc)).not.toContain("<ol")
		expect(paraTextoPlano(doc)).toContain("1. Trata-se de alteração de período de férias.")
	})

	it("escapa marcação vinda do texto do usuário", () => {
		const comHtml = montarDocumento(base({ paragrafos: [{ texto: "Referente ao item <b>2</b> & anexo" }] }))
		expect(paraHtml(comHtml)).toContain("&lt;b&gt;2&lt;/b&gt; &amp; anexo")
	})

	it("oferece cada bloco como campo copiável, na ordem do documento", () => {
		const campos = camposParaCopia(doc)
		expect(campos.map((c) => c.id)).toEqual(doc.blocos.map((b) => b.id))
		expect(campos.every((c) => c.texto.length > 0 && c.html.length > 0)).toBe(true)
	})

	it("desce a localidade e a data para a linha seguinte no texto puro", () => {
		const numeracao = camposParaCopia(doc).find((c) => c.id === "numeracao")
		expect(numeracao?.texto).toBe("Ofício nº 34/GAB/255\nBrasília, 3 de julho de 2026.")
	})
})

describe("busca de espécie", () => {
	it("devolve undefined para id desconhecido, e o montador falha alto", () => {
		expect(buscarEspecie("mensagem-telegrafica")).toBeUndefined()
		expect(() => montarDocumento(base({ especie: "mensagem-telegrafica" }))).toThrow(/Espécie desconhecida/)
	})
})

describe("campos em branco", () => {
	/**
	 * O documento é montado ao vivo, com o formulário quase vazio na maior parte do tempo.
	 * O que o usuário vê no papel é o que ele copia — então sobra de rascunho ("Do" sem
	 * cargo, uma vírgula sem localidade) é conteúdo errado, não só feiura.
	 */
	const vazio = base({
		om: { nome: "" },
		localidade: "",
		remetente: { cargo: "" },
		destinatarios: [{ cargo: "" }],
		assunto: "",
		paragrafos: [{ texto: "" }],
		signatario: { nome: "" },
	})

	it("não emite preâmbulo, epígrafe nem texto quando os campos estão vazios", () => {
		const ids = montarDocumento(vazio).blocos.map((b) => b.id)
		expect(ids).not.toContain("preambulo")
		expect(ids).not.toContain("epigrafe")
		expect(ids).not.toContain("texto")
		expect(ids).not.toContain("signatario")
	})

	it("omite a vírgula da localidade quando ela não foi preenchida", () => {
		expect(montarDocumento(vazio).blocos.find((b) => b.id === "numeracao")?.linhas[0].mesmaLinhaDireita).toBe("3 de julho de 2026.")
	})

	it("ignora destinatário sem cargo, mas mantém os preenchidos", () => {
		const doc = montarDocumento(base({ destinatarios: [{ cargo: "" }, { cargo: "COMGEP" }] }))
		expect(doc.blocos.find((b) => b.id === "preambulo")?.linhas.map((l) => l.texto)).toEqual([
			"Do Diretor do Instituto de Economia e Finanças da Aeronáutica",
			"Ao COMGEP",
		])
	})
})

describe("regressões apontadas na revisão", () => {
	it("o requerimento sem NUP ainda imprime a data (art. 55 § 2º, III)", () => {
		// A data viajava na linha do NUP; sem NUP, o `break` levava a data junto e o
		// documento saía sem data nenhuma, sem nada avisar.
		const doc = montarDocumento(base({ especie: "requerimento", nup: undefined }))
		const data = doc.blocos.find((b) => b.id === "localidade-data")
		expect(data?.linhas[0].texto).toBe("Brasília, 3 de julho de 2026.")
	})

	it("avisa que a data da Ata mora no texto, já que ela não tem linha de data", () => {
		const doc = montarDocumento(base({ especie: "ata" }))
		expect(doc.blocos.map((b) => b.id)).not.toContain("localidade-data")
		expect(doc.avisos.join(" ")).toContain("art. 44 § 3º, I")
	})
})
