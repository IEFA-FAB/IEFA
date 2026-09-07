import { describe, expect, it } from "bun:test"
import { assembleDocument } from "./assemble"
import { DOCUMENT_KINDS, EXTERNAL_OFICIO_LABEL, findKind, resolveKind } from "./catalog"
import { newDocument } from "./draft"
import { applyInlineEdit } from "./inline-edit"
import { sigadaerHandoff, toPlainText } from "./sigadaer"
import type { DocumentInput, EditTarget } from "./types"
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

describe("entrega ao SIGADAER", () => {
	const doc = assembleDocument(base())
	const { fields, generated } = sigadaerHandoff(base(), doc)
	const field = (id: string) => fields.find((c) => c.id === id)

	it("não oferece para colar nada que o SIGADAER imprime sozinho", () => {
		// Timbre, epígrafe, numeração, NUP, preâmbulo e signatário saem do cadastro da UO e
		// dos campos do formulário. Colá-los na caixa de texto duplicava o cabeçalho DENTRO
		// do corpo do ofício — foi o motivo de o "copiar documento inteiro" deixar de existir.
		const texto = field("texto")?.value ?? ""
		expect(texto).not.toContain("MINISTÉRIO DA DEFESA")
		expect(texto).not.toContain("Instituto de Economia e Finanças da Aeronáutica")
		expect(texto).not.toContain("Ofício nº 34/GAB/255")
		expect(texto).not.toContain("Protocolo COMAER")
		expect(texto).not.toContain("Do Diretor")
		expect(texto).not.toContain("FULANO DE TAL")
	})

	it("lista o que o SIGADAER preenche, para conferência", () => {
		expect(generated.map((b) => b.id)).toContain("epigrafe")
		expect(generated.find((b) => b.id === "numeracao")?.value).toBe("Ofício nº 34/GAB/255\nBrasília, 3 de julho de 2026.")
	})

	it("manda o assunto cru para o campo próprio, sem rótulo e sem ponto final", () => {
		// O SIGADAER imprime o "Assunto:" e o art. 37 § 2º, II quer a ementa sem ponto.
		expect(field("assunto")?.value).toBe("Alteração de período de férias")
		expect(field("assunto")?.maxLength).toBe(255)
	})

	it("separa o artigo do cargo, porque no formulário são campos diferentes", () => {
		const feminino = base({
			sender: { position: "Chefe da Seção de Pesquisa e Inovação", gender: "f" },
			recipients: [{ position: "Diretora-Geral", gender: "f" }],
		})
		const partes = sigadaerHandoff(feminino, assembleDocument(feminino)).fields
		expect(partes.find((c) => c.id === "remetente-artigo")?.value).toBe("Da")
		expect(partes.find((c) => c.id === "remetente-artigo")?.choice).toBe(true)
		expect(partes.find((c) => c.id === "remetente-cargo")?.value).toBe("Chefe da Seção de Pesquisa e Inovação")
		expect(partes.find((c) => c.id === "destinatario-artigo-0")?.value).toBe("À")
		expect(partes.find((c) => c.id === "destinatario-cargo-0")?.value).toBe("Diretora-Geral")
	})

	it("leva o “via” junto do cargo do destinatário — o formulário não tem campo para ele", () => {
		const comVia = base({ recipients: [{ position: "Comandante-Geral do Pessoal", via: "Diretor de Administração do Pessoal" }] })
		const partes = sigadaerHandoff(comVia, assembleDocument(comVia)).fields
		expect(partes.find((c) => c.id === "destinatario-cargo-0")?.value).toBe("Comandante-Geral do Pessoal, via Diretor de Administração do Pessoal")
	})

	it("escapa a numeração do art. 39 para o editor Markdown não renumerar sozinho", () => {
		// A caixa de texto do SIGADAER é um textarea com editor Markdown: "1. " vira lista
		// ordenada e "- " vira marcador, e o sistema passa a numerar por conta própria.
		const comDivisoes = base({
			paragraphs: [
				{ text: "Primeiro.", items: [{ text: "Item.", alineas: [{ text: "Alínea.", subalineas: [{ text: "Subalínea." }] }] }] },
				{ text: "Segundo." },
			],
		})
		const texto = sigadaerHandoff(comDivisoes, assembleDocument(comDivisoes)).fields.find((c) => c.id === "texto")?.value ?? ""
		expect(texto).toContain("1\\. Primeiro.")
		expect(texto).toContain("\\- Subalínea.")
		// "1.1" e "a)" não são marcadores de lista no Markdown: escapar ali só sujaria o texto.
		expect(texto).toContain("1.1 Item.")
		expect(texto).toContain("a) Alínea.")
	})

	it("desmonta o “No Imp”: o SIGADAER tem campo separado e o monta sozinho", () => {
		// Mandar a forma já montada da folha (art. 40 § 7º) escreveria "No Imp" duas vezes.
		const comImpedimento = base({ signer: { ...base().signer, noImp: { name: "Sicrano de Tal", rank: "TCel", quadro: "Int" } } })
		const partes = sigadaerHandoff(comImpedimento, assembleDocument(comImpedimento)).fields
		expect(partes.find((c) => c.id === "signatario")?.value).not.toContain("No Imp")
		expect(partes.find((c) => c.id === "signatario")?.value).toContain("FULANO DE TAL")
		expect(partes.find((c) => c.id === "signatario-impedimento")?.value).toBe("SICRANO DE TAL TCel Int")
	})

	it("manda a data sem o ordinal, que o campo do SIGADAER lê de volta como data", () => {
		const primeiroDia = base({ date: new Date(2026, 6, 1) })
		expect(sigadaerHandoff(primeiroDia, assembleDocument(primeiroDia)).fields.find((c) => c.id === "data")?.value).toBe("1 de julho de 2026")
		// Na folha o ordinal continua, porque é o que o art. 12 § 4º manda imprimir.
		expect(toPlainText(assembleDocument(primeiroDia))).toContain("1º de julho de 2026")
	})
})

describe("contato da OM", () => {
	const externo = () =>
		base({
			kind: "oficio-externo",
			scope: "externo",
			om: { name: "IEFA", acronym: "IEFA", address: "Av. Marechal Câmara, 233", phone: "(21) 2101-4000", email: "iefa@fab.mil.br" },
			sender: undefined,
			recipients: [],
			addressing: { formOfAddress: "senhoria", gender: "m", name: "Beltrano de Tal" },
		})

	it("imprime endereço, telefone e e-mail UMA vez, no rodapé", () => {
		// Estava sob a epígrafe E no rodapé: a mesma linha, duas vezes na mesma folha, a
		// segunda logo acima da linha de numeração.
		const doc = assembleDocument(externo())
		const contato = "Av. Marechal Câmara, 233 - (21) 2101-4000 - iefa@fab.mil.br"
		expect(doc.blocks.filter((b) => b.lines.some((l) => l.text === contato)).map((b) => b.id)).toEqual(["rodape-om"])
	})

	it("viaja no campo Texto: o SIGADAER não tem campo de contato nem o imprime", () => {
		// É acréscimo desta ferramenta. Listá-lo como "o sistema preenche" prometia uma linha
		// que nunca sairia no papel.
		const documento = externo()
		const { fields, generated } = sigadaerHandoff(documento, assembleDocument(documento))
		expect(generated.map((b) => b.id)).not.toContain("rodape-om")
		expect(fields.find((c) => c.id === "texto")?.value).toContain("Av. Marechal Câmara, 233 - (21) 2101-4000 - iefa@fab.mil.br")
		expect(fields.find((c) => c.id === "texto")?.hint).toContain("contato da OM")
	})
})

describe("achados de conferência", () => {
	it("acusa número no ofício de interesse particular (art. 51 § 6º)", () => {
		// O aviso inverso — falta de sequencial — já existia e ISENTA esta espécie. Numerar
		// aqui não era conferido por ninguém, e o expediente pessoal saía ocupando número da
		// série da OM, contra o nome da própria espécie ("s/nº").
		const doc = assembleDocument(base({ kind: "oficio-particular", scope: "comaer", numbering: { sequence: 5, sector: "GAB" } }))
		const achado = doc.warnings.find((w) => w.text.includes("não recebe número"))
		expect(achado?.severity).toBe("nonCompliant")
		expect(achado?.block).toBe("numeracao")
		// Sem número, nada a acusar.
		const semNumero = assembleDocument(base({ kind: "oficio-particular", scope: "comaer", numbering: { sequence: null } }))
		expect(semNumero.warnings.map((w) => w.text).join(" ")).not.toContain("não recebe número")
	})

	it("acusa assunto acima do que o campo do SIGADAER aceita", () => {
		// O campo tem maxlength 255 e trunca sem avisar: a ementa chegava cortada ao protocolo.
		const longo = assembleDocument(base({ subject: "a".repeat(256) }))
		const achado = longo.warnings.find((w) => w.text.includes("caracteres e o campo do SIGADAER"))
		expect(achado?.severity).toBe("nonCompliant")
		expect(
			assembleDocument(base({ subject: "a".repeat(255) }))
				.warnings.map((w) => w.text)
				.join(" ")
		).not.toContain("campo do SIGADAER")
	})

	it("ancora a falta de localidade no bloco que a espécie realmente imprime", () => {
		// A folha marca o achado pelo id do bloco RENDERIZADO: em certidão a data mora em
		// bloco próprio, e apontar "numeracao" mandava o realce para um bloco inexistente.
		const oficio = assembleDocument(base({ city: "" }))
		expect(oficio.warnings.find((w) => w.text.includes("Falta a localidade"))?.block).toBe("numeracao")
		const certidao = assembleDocument(base({ kind: "certidao", city: "", paragraphs: [{ text: "Certifico, para fins de prova." }] }))
		const achado = certidao.warnings.find((w) => w.text.includes("Falta a localidade"))
		expect(achado?.block).toBe("localidade-data")
		// O que o achado aponta tem de EXISTIR na folha: é por esse id que o realce se prende.
		expect(certidao.blocks.map((b) => b.id)).toContain("localidade-data")
	})
})

describe("referências e anexos com entrada em branco", () => {
	/**
	 * O formulário acrescenta item vazio e a pessoa preenche o seguinte. A linha impressa
	 * renumera (pula o vazio), mas a edição na folha tem de voltar à posição ORIGINAL —
	 * antes ela gravava no vazio: a linha visível não mudava e nascia uma referência
	 * invisível no documento.
	 */
	it("edita a posição de origem, não a posição impressa", () => {
		const doc = assembleDocument(base({ references: ["", "Ofício nº 136/DP/1288"], annexes: ["", "", "Três folhas de alterações"] }))
		const ementa = doc.blocks.find((b) => b.id === "ementa")
		const referencia = ementa?.lines.find((l) => l.text.startsWith("Referência:"))
		expect(referencia?.text).toBe("Referência: 1. Ofício nº 136/DP/1288.")
		expect(referencia?.edit).toEqual({ target: { field: "reference", index: 1 }, value: "Ofício nº 136/DP/1288" })
		const anexo = ementa?.lines.find((l) => l.text.startsWith("Anexo:"))
		expect(anexo?.text).toBe("Anexo: A. Três folhas de alterações.")
		expect(anexo?.edit).toEqual({ target: { field: "annex", index: 2 }, value: "Três folhas de alterações" })
	})

	it("aplicada de volta, a edição altera a entrada certa", () => {
		const documento = base({ references: ["", "Ofício nº 136/DP/1288"] })
		const linha = assembleDocument(documento)
			.blocks.find((b) => b.id === "ementa")
			?.lines.find((l) => l.text.startsWith("Referência:"))
		const depois = applyInlineEdit(documento, linha?.edit?.target as EditTarget, "Ofício nº 9/GAB/1")
		expect(depois.references).toEqual(["", "Ofício nº 9/GAB/1"])
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

describe("espécie fora do catálogo", () => {
	/**
	 * `kind` é `z.string()` no payload de propósito: restringi-lo tornaria inabrível um
	 * documento salvo com espécie que depois saísse da lista. O preço é que todo consumidor
	 * precisa cair para algum lugar — a rota da conversa não caía, e um documento assim
	 * renderizava normal na tela e derrubava toda mensagem enviada.
	 */
	it("a montagem lança, e é por isso que quem monta passa pelo `resolveKind`", () => {
		expect(() => assembleDocument({ ...newDocument(), kind: "portaria-inexistente" })).toThrow()
		expect(resolveKind("portaria-inexistente").id).toBe("oficio-comaer")
		expect(() => assembleDocument({ ...newDocument(), kind: resolveKind("portaria-inexistente").id })).not.toThrow()
	})

	it("espécie conhecida atravessa intacta", () => {
		expect(resolveKind("requerimento").id).toBe("requerimento")
	})
})
