/**
 * @module comaer/especies
 * Catálogo das espécies de comunicação oficial (NSCA 5-3/2026, Anexo I, cap. VIII e IX).
 *
 * O catálogo é DADO. Cada espécie declara os blocos que a norma manda ter, e o montador
 * percorre essa lista — é o que permite acrescentar Parecer, Ata ou Requerimento sem
 * escrever uma nova folha em JSX. Cada entrada carrega o `fundamento` porque a tela mostra
 * ao usuário de qual artigo vem a forma que ele está vendo.
 */

import type { NumberingScope } from "./format"
import type { BlockId, Scope } from "./types"

export type DocumentKindId =
	| "oficio-interno-om"
	| "oficio-comaer"
	| "oficio-externo"
	| "oficio-particular"
	| "despacho"
	| "despacho-decisorio"
	| "requerimento"
	| "parecer"
	| "ata"
	| "carta"
	| "certidao"
	| "declaracao"
	| "apostila"
	| "ordem-tecnica"

export interface DocumentKind {
	id: DocumentKindId
	label: string
	/** Como a espécie se nomeia na linha de numeração ("Ofício nº 34/GAB/255"). */
	numberingLabel: string
	description: string
	/** Artigo do Anexo I que define a forma — exibido na tela. */
	legalBasis: string
	/** Art. 8º — timbre 5 (com emblema) ou 7 (linha simples). */
	timbre: 5 | 7
	blocks: readonly BlockId[]
	numbering: NumberingScope
	/** Art. 39 — a carta e o despacho decisório têm texto sem numeração de parágrafo. */
	numberedParagraphs: boolean
	/** Art. 30 — só quem se dirige a fora do COMAER pode ter fecho de cortesia. */
	allowsClosing: boolean
	/** Âmbitos em que a espécie faz sentido. */
	scopes: readonly Scope[]
	/** Título centralizado em caixa alta, quando a espécie o exige. */
	title?: string
	/**
	 * Onde a localidade e a data caem: na linha da numeração (art. 35, III), na linha do
	 * NUP (requerimento, art. 55 § 2º, III) ou em bloco próprio, abaixo do texto
	 * (certidão e declaração, art. 46 § 4º, V).
	 */
	dateOnLine: "numeracao" | "nup" | "propria"
	/** Abertura obrigatória ou sugerida pelo artigo da espécie. */
	suggestedOpening?: string
}

const OFICIO_BLOCKS = ["timbre", "epigrafe", "numeracao", "nup", "preambulo", "ementa", "texto", "signatario"] as const satisfies readonly BlockId[]

/**
 * O rótulo do ofício externo é citado pela conferência de conformidade: é a espécie que a
 * pessoa deve escolher quando quer o fecho de cortesia. Fica aqui para que renomear a
 * espécie renomeie também a explicação.
 */
export const EXTERNAL_OFICIO_LABEL = "Ofício a órgão externo ao COMAER"

export const DOCUMENT_KINDS: readonly DocumentKind[] = [
	{
		id: "oficio-interno-om",
		label: "Ofício interno à OM",
		numberingLabel: "Ofício",
		description: "Circula entre setores da própria Organização Militar. Numeração só com sequencial e sigla do setor.",
		legalBasis: "Anexo I, art. 51, § 5º",
		timbre: 5,
		blocks: OFICIO_BLOCKS,
		numbering: "interna",
		numberedParagraphs: true,
		allowsClosing: false,
		scopes: ["interno-om"],
		dateOnLine: "numeracao",
	},
	{
		id: "oficio-comaer",
		label: "Ofício entre OM do COMAER",
		numberingLabel: "Ofício",
		description: "Documento padrão de comunicação administrativa entre Organizações Militares. Admite caráter circular ou DIFRAL.",
		legalBasis: "Anexo I, art. 51, § 8º",
		timbre: 5,
		blocks: OFICIO_BLOCKS,
		numbering: "completa",
		numberedParagraphs: true,
		allowsClosing: false,
		scopes: ["comaer"],
		dateOnLine: "numeracao",
	},
	{
		id: "oficio-externo",
		label: EXTERNAL_OFICIO_LABEL,
		numberingLabel: "Ofício",
		description: "Segue a diagramação do Manual de Redação da Presidência da República: endereçamento, vocativo e fecho de cortesia.",
		legalBasis: "Anexo I, art. 51, § 9º",
		timbre: 5,
		blocks: ["timbre", "epigrafe", "numeracao", "nup", "enderecamento", "ementa", "vocativo", "texto", "fecho", "signatario", "rodape-om"],
		numbering: "completa",
		numberedParagraphs: true,
		allowsClosing: true,
		scopes: ["externo"],
		dateOnLine: "numeracao",
	},
	{
		id: "oficio-particular",
		label: "Ofício de interesse particular (s/nº)",
		numberingLabel: "Ofício",
		description: "Assunto de interesse particular do agente público: epígrafe só com o nome da OM, sem número e sem cargo no signatário.",
		legalBasis: "Anexo I, art. 51, § 6º e § 7º",
		timbre: 5,
		blocks: OFICIO_BLOCKS,
		numbering: "interna",
		numberedParagraphs: true,
		allowsClosing: false,
		scopes: ["interno-om", "comaer"],
		dateOnLine: "numeracao",
	},
	{
		id: "despacho",
		label: "Despacho",
		numberingLabel: "Nº",
		description: "Expedido em continuação a outro documento; instrui o processo e mantém a correspondência junto à peça inicial.",
		legalBasis: "Anexo I, art. 48",
		timbre: 7,
		blocks: ["timbre", "epigrafe", "processo", "titulo", "numeracao", "preambulo", "texto", "signatario"],
		numbering: "completa",
		numberedParagraphs: true,
		allowsClosing: false,
		scopes: ["interno-om", "comaer"],
		dateOnLine: "numeracao",
		suggestedOpening: "Trata o presente expediente ",
	},
	{
		id: "despacho-decisorio",
		label: "Despacho decisório",
		numberingLabel: "Nº",
		description: "Decisão fundamentada sobre requerimento ou processo. O texto abre por DEFERIDO, INDEFERIDO ou ARQUIVE-SE.",
		legalBasis: "Anexo I, art. 49",
		timbre: 7,
		blocks: ["timbre", "epigrafe", "titulo", "numeracao", "processo", "texto", "signatario"],
		numbering: "completa",
		numberedParagraphs: false,
		allowsClosing: false,
		scopes: ["interno-om", "comaer"],
		title: "DESPACHO",
		dateOnLine: "numeracao",
	},
	{
		id: "requerimento",
		label: "Requerimento",
		numberingLabel: "Requerimento",
		description: "Pleito de direito ou benefício dirigido à autoridade competente, redigido na terceira pessoa do singular.",
		legalBasis: "Anexo I, art. 55",
		timbre: 7,
		blocks: ["timbre", "titulo", "nup", "preambulo", "ementa", "texto", "signatario"],
		numbering: "nenhuma",
		numberedParagraphs: true,
		allowsClosing: false,
		scopes: ["interno-om", "comaer"],
		title: "REQUERIMENTO",
		dateOnLine: "nup",
	},
	{
		id: "parecer",
		label: "Parecer",
		numberingLabel: "Parecer",
		description: "Opinião especializada e fundamentada. Não tem preâmbulo, e a ementa começa por “Parecer sobre…”.",
		legalBasis: "Anexo I, art. 53",
		timbre: 5,
		blocks: ["timbre", "epigrafe", "numeracao", "ementa", "texto", "signatario"],
		numbering: "parecer",
		numberedParagraphs: true,
		allowsClosing: false,
		scopes: ["interno-om", "comaer"],
		dateOnLine: "numeracao",
		suggestedOpening: "Parecer sobre ",
	},
	{
		id: "ata",
		label: "Ata",
		numberingLabel: "Ata",
		description: "Registro de fatos e resoluções de assembleia, sessão ou reunião. Assinaturas em ordem de antiguidade, secretário por último.",
		legalBasis: "Anexo I, art. 44",
		timbre: 5,
		blocks: ["timbre", "epigrafe", "titulo", "texto", "signatario"],
		numbering: "nenhuma",
		numberedParagraphs: true,
		allowsClosing: false,
		scopes: ["interno-om", "comaer"],
		title: "ATA",
		dateOnLine: "propria",
	},
	{
		id: "carta",
		label: "Carta",
		numberingLabel: "Carta",
		description: "Comunicação externa de caráter social dirigida a particular. Parágrafos sem numeração.",
		legalBasis: "Anexo I, art. 45",
		timbre: 5,
		blocks: ["timbre", "epigrafe", "numeracao", "nup", "enderecamento", "vocativo", "texto", "fecho", "signatario", "rodape-om"],
		numbering: "completa",
		numberedParagraphs: false,
		allowsClosing: true,
		scopes: ["externo"],
		dateOnLine: "numeracao",
	},
	{
		id: "certidao",
		label: "Certidão",
		numberingLabel: "Certidão",
		description: "Certifica algo já registrado e comprovado. Texto abre por “Certifico, para fins de …”.",
		legalBasis: "Anexo I, art. 46",
		timbre: 5,
		blocks: ["timbre", "epigrafe", "titulo", "texto", "localidade-data", "signatario", "rodape-om"],
		numbering: "completa",
		numberedParagraphs: false,
		allowsClosing: false,
		scopes: ["interno-om", "comaer", "externo"],
		title: "CERTIDÃO",
		dateOnLine: "propria",
		suggestedOpening: "Certifico, para fins de ",
	},
	{
		id: "declaracao",
		label: "Declaração",
		numberingLabel: "Declaração",
		description: "Documento testemunhal com prazo de validade e finalidade declarados. Posto e cargo obrigatoriamente por extenso.",
		legalBasis: "Anexo I, art. 47",
		timbre: 5,
		blocks: ["timbre", "epigrafe", "titulo", "texto", "localidade-data", "signatario", "rodape-om"],
		numbering: "nenhuma",
		numberedParagraphs: false,
		allowsClosing: false,
		scopes: ["externo"],
		title: "DECLARAÇÃO",
		dateOnLine: "propria",
		suggestedOpening: "Declaro, para fins de ",
	},
	{
		id: "apostila",
		label: "Apostila",
		numberingLabel: "Apostila",
		description: "Averbação que corrige inexatidão ou completa registro de ato já publicado, sem alterar sua substância.",
		legalBasis: "Anexo I, art. 43",
		timbre: 5,
		blocks: ["timbre", "titulo", "texto", "localidade-data", "signatario"],
		numbering: "nenhuma",
		numberedParagraphs: false,
		allowsClosing: false,
		scopes: ["interno-om", "comaer"],
		title: "APOSTILA",
		dateOnLine: "propria",
	},
	{
		id: "ordem-tecnica",
		label: "Ordem Técnica",
		numberingLabel: "Ordem Técnica",
		description: "Estabelece padrões e procedimentos técnicos: sumário, finalidade, âmbito, legislação e procedimentos.",
		legalBasis: "Anexo I, art. 52",
		timbre: 5,
		blocks: ["timbre", "epigrafe", "titulo", "numeracao", "texto", "signatario"],
		numbering: "completa",
		numberedParagraphs: true,
		allowsClosing: false,
		scopes: ["interno-om", "comaer"],
		title: "ORDEM TÉCNICA",
		dateOnLine: "numeracao",
	},
]

export function findKind(id: string): DocumentKind | undefined {
	return DOCUMENT_KINDS.find((e) => e.id === id)
}

/** Espécies compatíveis com o âmbito escolhido — evita oferecer fecho onde ele é proibido. */
export function kindsForScope(scope: Scope): DocumentKind[] {
	return DOCUMENT_KINDS.filter((e) => e.scopes.includes(scope))
}

/**
 * Catálogo em texto, para o prompt do modelo.
 *
 * Sai daqui, e não de uma lista escrita à mão no prompt, porque espécie nova no catálogo
 * tem de aparecer para o modelo no mesmo commit — uma cópia no prompt envelheceria em
 * silêncio, e o modelo continuaria escolhendo entre as espécies de ontem.
 */
export function describeCatalog(): string {
	return DOCUMENT_KINDS.map((e) => `- ${e.id} — ${e.label} (${e.legalBasis}). Âmbitos: ${e.scopes.join(", ")}. ${e.description}`).join("\n")
}

/**
 * Concilia o que o modelo sugeriu com o que a norma permite.
 *
 * O par espécie × âmbito não é livre: o ofício externo não existe dentro do COMAER e a
 * declaração não circula entre OM. Aceitar a sugestão sem conferir renderizaria fecho de
 * cortesia onde o art. 30 o proíbe, que é justamente o que o catálogo existe para impedir.
 *
 * Sugestão incoerente não é descartada em silêncio: a espécie manda, porque é a escolha
 * mais específica, e o âmbito é puxado para um que a comporte.
 */
export function reconcileKindAndScope(current: { kind: string; scope: Scope }, suggested: { kind?: string; scope?: Scope }): { kind: string; scope: Scope } {
	const kind = suggested.kind && findKind(suggested.kind) ? suggested.kind : current.kind
	const definition = findKind(kind)
	if (!definition) return current

	const scope = suggested.scope ?? current.scope
	if (definition.scopes.includes(scope)) return { kind, scope }
	// O âmbito sugerido não comporta a espécie: fica o primeiro que a norma admite para ela.
	return { kind, scope: definition.scopes[0] }
}
