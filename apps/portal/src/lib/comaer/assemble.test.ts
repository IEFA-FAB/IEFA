import { describe, expect, it } from "bun:test"
import { assembleDocument } from "./assemble"
import { DOCUMENT_KINDS, EXTERNAL_OFICIO_LABEL, findKind } from "./catalog"
import { newDocument } from "./draft"
import { copyableFields, toHtml, toPlainText } from "./sigadaer"
import type { DocumentInput } from "./types"
import { seedFromProfile } from "./writer-profile"

function base(over: Partial<DocumentInput> = {}): DocumentInput {
	return {
		kind: "oficio-comaer",
		scope: "comaer",
		classification: "ostensivo",
		om: { name: "Instituto de Economia e Finanças da Aeronáutica", acronym: "IEFA" },
		numbering: { sequence: 34, sector: "GAB", organizationNumber: "255" },
		nup: "68000000000202600",
		city: "Brasília",
		date: new Date(2026, 6, 3),
		sender: { position: "Diretor do Instituto de Economia e Finanças da Aeronáutica" },
		recipients: [{ position: "Comandante-Geral do Pessoal" }],
		subject: "Alteração de período de férias",
		paragraphs: [{ text: "Trata-se de alteração de período de férias." }, { text: "Solicita-se providência." }],
		signer: { name: "Fulano de Tal", rank: "Cel", quadro: "Int", position: "Diretor", om: "IEFA" },
		...over,
	}
}

describe("catálogo de espécies", () => {
	it("toda espécie declara texto, signatário e o artigo que a fundamenta", () => {
		for (const e of DOCUMENT_KINDS) {
			expect(e.blocks, e.id).toContain("texto")
			expect(e.blocks, e.id).toContain("signatario")
			expect(e.legalBasis, e.id).toMatch(/art\. \d+/)
		}
	})

	it("só espécie de âmbito externo pode ter fecho de cortesia (art. 30)", () => {
		// O inverso é o que a norma proíbe: fecho em documento que circula dentro do COMAER.
		for (const e of DOCUMENT_KINDS) {
			if (e.allowsClosing) expect(e.scopes, e.id).toContain("externo")
			if (!e.scopes.includes("externo")) expect(e.allowsClosing, e.id).toBe(false)
		}
	})

	it("declara bloco de fecho apenas quando o permite", () => {
		for (const e of DOCUMENT_KINDS) {
			if (e.blocks.includes("fecho")) expect(e.allowsClosing, e.id).toBe(true)
		}
	})
})

describe("montagem do documento", () => {
	it("o ofício entre OM do COMAER não recebe fecho de cortesia", () => {
		const doc = assembleDocument(base({ precedence: "superior" }))
		expect(doc.blocks.map((b) => b.id)).not.toContain("fecho")
	})

	it("o ofício externo recebe endereçamento, vocativo e fecho", () => {
		const doc = assembleDocument(
			base({
				kind: "oficio-externo",
				scope: "externo",
				precedence: "superior",
				addressing: { formOfAddress: "excelencia", gender: "m", name: "Fulano de Tal", position: "Juiz de Direito da 10ª Vara Cível" },
				sender: undefined,
				recipients: [],
			})
		)
		const ids = doc.blocks.map((b) => b.id)
		expect(ids).toContain("enderecamento")
		expect(ids).toContain("vocativo")
		expect(doc.blocks.find((b) => b.id === "fecho")?.lines[0].text).toBe("Respeitosamente,")
		expect(doc.blocks.find((b) => b.id === "enderecamento")?.lines[0].text).toBe("A Sua Excelência o Senhor")
	})

	it("põe localidade e data na linha da numeração, e no requerimento na linha do NUP", () => {
		expect(assembleDocument(base()).blocks.find((b) => b.id === "numeracao")?.lines[0].rightOnSameLine).toBe("Brasília, 3 de julho de 2026.")
		const req = assembleDocument(base({ kind: "requerimento" }))
		expect(req.blocks.find((b) => b.id === "nup")?.lines[0].rightOnSameLine).toBe("Brasília, 3 de julho de 2026.")
		expect(req.blocks.map((b) => b.id)).not.toContain("numeracao")
	})

	it("o ofício de interesse particular identifica o signatário pelo nome e omite o cargo (art. 51 § 7º)", () => {
		const doc = assembleDocument(base({ kind: "oficio-particular", numbering: { sequence: null } }))
		expect(doc.blocks.find((b) => b.id === "preambulo")?.lines[0].text).toBe("Do Cel Int FULANO DE TAL")
		expect(doc.blocks.find((b) => b.id === "signatario")?.lines.map((l) => l.text)).toEqual(["FULANO DE TAL Cel Int"])
	})

	it("o despacho decisório abre o texto pela decisão em caixa alta (art. 49 § 2º, III)", () => {
		const doc = assembleDocument(
			base({ kind: "despacho-decisorio", decision: "DEFERIDO", paragraphs: [{ text: "de acordo com o art. 5º das Instruções Gerais." }] })
		)
		expect(doc.blocks.find((b) => b.id === "texto")?.lines[0].text).toBe("DEFERIDO, de acordo com o art. 5º das Instruções Gerais.")
	})

	it("a certidão leva a numeração no próprio título (art. 46 § 4º, III)", () => {
		const doc = assembleDocument(
			base({ kind: "certidao", scope: "externo", paragraphs: [{ text: "Certifico, para fins de comprovação de tempo de serviço." }] })
		)
		expect(doc.blocks.find((b) => b.id === "titulo")?.lines[0].text).toBe("CERTIDÃO nº 34/GAB/255")
	})
})

/** Texto de todos os achados, para as asserções que só querem saber se foi apontado. */
describe("conferência de conformidade", () => {
	it("acusa NUP ausente ou incompleto", () => {
		expect(
			assembleDocument(base({ nup: undefined }))
				.warnings.map((w) => w.text)
				.join(" ")
		).toContain("NUP")
		expect(
			assembleDocument(base({ nup: "680" }))
				.warnings.map((w) => w.text)
				.join(" ")
		).toContain("NUP")
		expect(
			assembleDocument(base())
				.warnings.map((w) => w.text)
				.join(" ")
		).not.toContain("NUP")
	})

	it("acusa documento por ordem sem a abertura obrigatória (art. 40 § 9º)", () => {
		const semAbertura = assembleDocument(base({ signer: { ...base().signer, byOrderOf: "Comandante-Geral de Apoio" } }))
		expect(semAbertura.warnings.map((w) => w.text).join(" ")).toContain("Por ordem")

		const comAbertura = assembleDocument(
			base({
				signer: { ...base().signer, byOrderOf: "Comandante-Geral de Apoio" },
				paragraphs: [{ text: "Por ordem do Comandante-Geral de Apoio, informo que…" }],
			})
		)
		expect(comAbertura.warnings.map((w) => w.text).join(" ")).not.toContain("Por ordem")
	})

	it("acusa ofício circular endereçado ao CMTAER (art. 51 § 8º, IV)", () => {
		const doc = assembleDocument(base({ distribution: "circular", recipients: [{ position: "CMTAER" }, { position: "COMGEP" }] }))
		expect(doc.warnings.map((w) => w.text).join(" ")).toContain("CMTAER")
	})

	it("acusa referência e anexo na ementa do ofício externo (art. 51 § 9º, IX)", () => {
		const doc = assembleDocument(base({ kind: "oficio-externo", scope: "externo", references: ["Ofício nº 1/GAB/2"], sender: undefined, recipients: [] }))
		expect(doc.warnings.map((w) => w.text).join(" ")).toContain("referências e anexos são citados no texto")
	})
})

describe("saída para o SIGADAER", () => {
	const doc = assembleDocument(base())

	it("gera HTML sem class, sem style e sem div — o que o sanitizador do editor destruiria", () => {
		const html = toHtml(doc)
		expect(html).not.toMatch(/class=|style=|<div/)
		expect(html).toMatch(/^<p>/)
	})

	it("mantém a numeração dos parágrafos como texto, não como lista HTML", () => {
		// `<ol>` deixaria o editor renumerar sozinho, e 1.1 / a) / - não são lista HTML.
		expect(toHtml(doc)).not.toContain("<ol")
		expect(toPlainText(doc)).toContain("1. Trata-se de alteração de período de férias.")
	})

	it("escapa marcação vinda do texto do usuário", () => {
		const comHtml = assembleDocument(base({ paragraphs: [{ text: "Referente ao item <b>2</b> & anexo" }] }))
		expect(toHtml(comHtml)).toContain("&lt;b&gt;2&lt;/b&gt; &amp; anexo")
	})

	it("oferece cada bloco como campo copiável, na ordem do documento", () => {
		const fields = copyableFields(doc)
		expect(fields.map((c) => c.id)).toEqual(doc.blocks.map((b) => b.id))
		expect(fields.every((c) => c.text.length > 0 && c.html.length > 0)).toBe(true)
	})

	it("desce a localidade e a data para a linha seguinte no texto puro", () => {
		const numbering = copyableFields(doc).find((c) => c.id === "numeracao")
		expect(numbering?.text).toBe("Ofício nº 34/GAB/255\nBrasília, 3 de julho de 2026.")
	})
})

describe("busca de espécie", () => {
	it("devolve undefined para id desconhecido, e o montador falha alto", () => {
		expect(findKind("mensagem-telegrafica")).toBeUndefined()
		expect(() => assembleDocument(base({ kind: "mensagem-telegrafica" }))).toThrow(/Espécie desconhecida/)
	})
})

describe("campos em branco", () => {
	/**
	 * O documento é montado ao vivo, com o formulário quase vazio na maior parte do tempo.
	 * O que o usuário vê no papel é o que ele copia — então sobra de rascunho ("Do" sem
	 * cargo, uma vírgula sem localidade) é conteúdo errado, não só feiura.
	 */
	const vazio = base({
		om: { name: "" },
		city: "",
		sender: { position: "" },
		recipients: [{ position: "" }],
		subject: "",
		paragraphs: [{ text: "" }],
		signer: { name: "" },
	})

	it("não emite preâmbulo, epígrafe nem texto quando os campos estão vazios", () => {
		const ids = assembleDocument(vazio).blocks.map((b) => b.id)
		expect(ids).not.toContain("preambulo")
		expect(ids).not.toContain("epigrafe")
		expect(ids).not.toContain("texto")
		expect(ids).not.toContain("signatario")
	})

	it("omite a vírgula da localidade quando ela não foi preenchida", () => {
		expect(assembleDocument(vazio).blocks.find((b) => b.id === "numeracao")?.lines[0].rightOnSameLine).toBe("3 de julho de 2026.")
	})

	it("ignora destinatário sem cargo, mas mantém os preenchidos", () => {
		const doc = assembleDocument(base({ recipients: [{ position: "" }, { position: "COMGEP" }] }))
		expect(doc.blocks.find((b) => b.id === "preambulo")?.lines.map((l) => l.text)).toEqual([
			"Do Diretor do Instituto de Economia e Finanças da Aeronáutica",
			"Ao COMGEP",
		])
	})
})

describe("regressões apontadas na revisão", () => {
	it("o requerimento sem NUP ainda imprime a data (art. 55 § 2º, III)", () => {
		// A data viajava na linha do NUP; sem NUP, o `break` levava a data junto e o
		// documento saía sem data nenhuma, sem nada avisar.
		const doc = assembleDocument(base({ kind: "requerimento", nup: undefined }))
		const data = doc.blocks.find((b) => b.id === "localidade-data")
		expect(data?.lines[0].text).toBe("Brasília, 3 de julho de 2026.")
	})

	it("avisa que a data da Ata mora no texto, já que ela não tem linha de data", () => {
		const doc = assembleDocument(base({ kind: "ata" }))
		expect(doc.blocks.map((b) => b.id)).not.toContain("localidade-data")
		expect(doc.warnings.map((w) => w.text).join(" ")).toContain("art. 44 § 3º, I")
	})
})

describe("conferência em dois níveis", () => {
	it("documento intocado não recebe achado nenhum", () => {
		// O alerta vermelho de NUP ausente abria em TODO documento em branco. O aviso mais
		// grave era também o primeiro, sempre — e virava paisagem.
		const blank = montarDocumentoEmBranco()
		expect(assembleDocument(blank).warnings).toEqual([])
	})

	it("campo vazio é pendência, norma contrariada é desconformidade", () => {
		const semOm = assembleDocument({ ...base(), om: { name: "" } })
		expect(semOm.warnings.find((w) => w.text.includes("nome da OM"))?.severity).toBe("pending")

		const circular = assembleDocument(base({ distribution: "circular", recipients: [{ position: "CMTAER" }] }))
		expect(circular.warnings.find((w) => w.text.includes("CMTAER"))?.severity).toBe("nonCompliant")
	})

	it("aponta o vazio que a montagem esconde", () => {
		// Bloco vazio não é renderizado: sem estes achados, a OM some da epígrafe e o
		// signatário some do fim, e a folha continua parecendo um documento plausível.
		const doc = assembleDocument({ ...base(), om: { name: "" }, signer: { name: "" }, city: "", subject: "", recipients: [{ position: "" }] })
		const texts = doc.warnings.map((w) => w.text).join(" ")
		expect(texts).toContain("nome da OM")
		expect(texts).toContain("nome do signatário")
		expect(texts).toContain("localidade")
		expect(texts).toContain("destinatário")
		expect(texts).toContain("assunto")
	})

	it('aponta o "s/nº" fora do expediente de interesse particular (art. 51 § 6º)', () => {
		const semNumero = assembleDocument(base({ numbering: { sequence: null, sector: "GAB", organizationNumber: "255" } }))
		expect(semNumero.warnings.map((w) => w.text).join(" ")).toContain("s/nº")

		// No ofício de interesse particular o "s/nº" é a forma certa: não há o que apontar.
		const particular = assembleDocument(base({ kind: "oficio-particular", numbering: { sequence: null } }))
		expect(particular.warnings.map((w) => w.text).join(" ")).not.toContain("s/nº")
	})

	it("cada achado aponta o bloco da folha a que se refere", () => {
		// É o que permite ao preview marcar onde está a pendência.
		const doc = assembleDocument({ ...base(), om: { name: "" }, nup: undefined })
		expect(doc.warnings.find((w) => w.text.includes("nome da OM"))?.block).toBe("epigrafe")
		expect(doc.warnings.find((w) => w.text.includes("NUP"))?.block).toBe("nup")
	})

	it("a Certidão externa é explicada, não acusada", () => {
		// O catálogo oferece a Certidão em âmbito externo; acusar a escolha que a própria
		// ferramenta ofereceu seria culpar o usuário pelo cardápio.
		const doc = assembleDocument(base({ kind: "certidao", scope: "externo", paragraphs: [{ text: "Certifico, para fins de comprovação." }] }))
		const fecho = doc.warnings.find((w) => w.text.includes("fecho de cortesia"))
		expect(fecho?.severity).toBe("pending")
		// A mensagem cita o rótulo do catálogo; se ele mudar de nome, ela acompanha.
		expect(fecho?.text).toContain(EXTERNAL_OFICIO_LABEL)
	})
})

/** Documento recém-criado, sem uma tecla digitada. */
function montarDocumentoEmBranco() {
	return { ...base(), om: { name: "" }, subject: "", signer: { name: "" }, paragraphs: [{ text: "" }], nup: undefined, city: "" }
}

describe("documento intocado com perfil salvo", () => {
	/**
	 * A conferência mede "começou a escrever" pelo assunto e pelo texto, não pela identidade:
	 * com perfil salvo, a OM, o signatário e a localidade já nascem preenchidos, e medir por
	 * eles devolvia a lista inteira de pendências no documento em branco — justamente para
	 * quem configurou a ferramenta.
	 */
	it("não aponta nada quando só a identidade veio do perfil", () => {
		const seeded = seedFromProfile(newDocument(), {
			om_name: "Base Aérea de Anápolis",
			om_acronym: "BAAN",
			om_sector: "GAB",
			om_address: null,
			om_phone: null,
			om_email: null,
			city: "Anápolis",
			nup_prefix: null,
			signer_name: "Fulano de Tal",
			signer_rank: "Cel",
			signer_quadro: "Int",
			signer_position: "Diretor",
		})
		expect(assembleDocument(seeded).warnings).toEqual([])
	})

	it("não aponta nada quando o assunto vem indefinido no payload", () => {
		// `subject` é opcional: `undefined?.trim() !== ""` é VERDADEIRO e ligava a conferência
		// sozinho, em todo documento cujo payload não trazia a chave.
		const { subject: _subject, ...rest } = newDocument()
		expect(assembleDocument(rest).warnings).toEqual([])
	})
})
