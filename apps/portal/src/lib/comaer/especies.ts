/**
 * @module comaer/especies
 * Catálogo das espécies de comunicação oficial (NSCA 5-3/2026, Anexo I, cap. VIII e IX).
 *
 * O catálogo é DADO. Cada espécie declara os blocos que a norma manda ter, e o montador
 * percorre essa lista — é o que permite acrescentar Parecer, Ata ou Requerimento sem
 * escrever uma nova folha em JSX. Cada entrada carrega o `fundamento` porque a tela mostra
 * ao usuário de qual artigo vem a forma que ele está vendo.
 */

import type { EscopoNumeracao } from "./format"
import type { Ambito, BlocoId } from "./tipos"

export type EspecieId =
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

export interface Especie {
	id: EspecieId
	rotulo: string
	/** Como a espécie se nomeia na linha de numeração ("Ofício nº 34/GAB/255"). */
	rotuloNumeracao: string
	descricao: string
	/** Artigo do Anexo I que define a forma — exibido na tela. */
	fundamento: string
	/** Art. 8º — timbre 5 (com emblema) ou 7 (linha simples). */
	timbre: 5 | 7
	blocos: readonly BlocoId[]
	numeracao: EscopoNumeracao
	/** Art. 39 — a carta e o despacho decisório têm texto sem numeração de parágrafo. */
	paragrafosNumerados: boolean
	/** Art. 30 — só quem se dirige a fora do COMAER pode ter fecho de cortesia. */
	permiteFecho: boolean
	/** Âmbitos em que a espécie faz sentido. */
	ambitos: readonly Ambito[]
	/** Título centralizado em caixa alta, quando a espécie o exige. */
	titulo?: string
	/**
	 * Onde a localidade e a data caem: na linha da numeração (art. 35, III), na linha do
	 * NUP (requerimento, art. 55 § 2º, III) ou em bloco próprio, abaixo do texto
	 * (certidão e declaração, art. 46 § 4º, V).
	 */
	dataNaLinha: "numeracao" | "nup" | "propria"
	/** Abertura obrigatória ou sugerida pelo artigo da espécie. */
	aberturaSugerida?: string
}

const OFICIO_BASE = ["timbre", "epigrafe", "numeracao", "nup", "preambulo", "ementa", "texto", "signatario"] as const satisfies readonly BlocoId[]

export const ESPECIES: readonly Especie[] = [
	{
		id: "oficio-interno-om",
		rotulo: "Ofício — trâmite interno à OM",
		rotuloNumeracao: "Ofício",
		descricao: "Circula entre setores da própria Organização Militar. Numeração só com sequencial e sigla do setor.",
		fundamento: "Anexo I, art. 51, § 5º",
		timbre: 5,
		blocos: OFICIO_BASE,
		numeracao: "interna",
		paragrafosNumerados: true,
		permiteFecho: false,
		ambitos: ["interno-om"],
		dataNaLinha: "numeracao",
	},
	{
		id: "oficio-comaer",
		rotulo: "Ofício — entre OM do COMAER",
		rotuloNumeracao: "Ofício",
		descricao: "Documento padrão de comunicação administrativa entre Organizações Militares. Admite caráter circular ou DIFRAL.",
		fundamento: "Anexo I, art. 51, § 8º",
		timbre: 5,
		blocos: OFICIO_BASE,
		numeracao: "completa",
		paragrafosNumerados: true,
		permiteFecho: false,
		ambitos: ["comaer"],
		dataNaLinha: "numeracao",
	},
	{
		id: "oficio-externo",
		rotulo: "Ofício — órgão externo ao COMAER",
		rotuloNumeracao: "Ofício",
		descricao: "Segue a diagramação do Manual de Redação da Presidência da República: endereçamento, vocativo e fecho de cortesia.",
		fundamento: "Anexo I, art. 51, § 9º",
		timbre: 5,
		blocos: ["timbre", "epigrafe", "numeracao", "nup", "enderecamento", "ementa", "vocativo", "texto", "fecho", "signatario", "rodape-om"],
		numeracao: "completa",
		paragrafosNumerados: true,
		permiteFecho: true,
		ambitos: ["externo"],
		dataNaLinha: "numeracao",
	},
	{
		id: "oficio-particular",
		rotulo: "Ofício — interesse particular (s/nº)",
		rotuloNumeracao: "Ofício",
		descricao: "Assunto de interesse particular do agente público: epígrafe só com o nome da OM, sem número e sem cargo no signatário.",
		fundamento: "Anexo I, art. 51, § 6º e § 7º",
		timbre: 5,
		blocos: OFICIO_BASE,
		numeracao: "interna",
		paragrafosNumerados: true,
		permiteFecho: false,
		ambitos: ["interno-om", "comaer"],
		dataNaLinha: "numeracao",
	},
	{
		id: "despacho",
		rotulo: "Despacho",
		rotuloNumeracao: "Nº",
		descricao: "Expedido em continuação a outro documento; instrui o processo e mantém a correspondência junto à peça inicial.",
		fundamento: "Anexo I, art. 48",
		timbre: 7,
		blocos: ["timbre", "epigrafe", "processo", "titulo", "numeracao", "preambulo", "texto", "signatario"],
		numeracao: "completa",
		paragrafosNumerados: true,
		permiteFecho: false,
		ambitos: ["interno-om", "comaer"],
		dataNaLinha: "numeracao",
		aberturaSugerida: "Trata o presente expediente ",
	},
	{
		id: "despacho-decisorio",
		rotulo: "Despacho decisório",
		rotuloNumeracao: "Nº",
		descricao: "Decisão fundamentada sobre requerimento ou processo. O texto abre por DEFERIDO, INDEFERIDO ou ARQUIVE-SE.",
		fundamento: "Anexo I, art. 49",
		timbre: 7,
		blocos: ["timbre", "epigrafe", "titulo", "numeracao", "processo", "texto", "signatario"],
		numeracao: "completa",
		paragrafosNumerados: false,
		permiteFecho: false,
		ambitos: ["interno-om", "comaer"],
		titulo: "DESPACHO",
		dataNaLinha: "numeracao",
	},
	{
		id: "requerimento",
		rotulo: "Requerimento",
		rotuloNumeracao: "Requerimento",
		descricao: "Pleito de direito ou benefício dirigido à autoridade competente, redigido na terceira pessoa do singular.",
		fundamento: "Anexo I, art. 55",
		timbre: 7,
		blocos: ["timbre", "titulo", "nup", "preambulo", "ementa", "texto", "signatario"],
		numeracao: "nenhuma",
		paragrafosNumerados: true,
		permiteFecho: false,
		ambitos: ["interno-om", "comaer"],
		titulo: "REQUERIMENTO",
		dataNaLinha: "nup",
	},
	{
		id: "parecer",
		rotulo: "Parecer",
		rotuloNumeracao: "Parecer",
		descricao: "Opinião especializada e fundamentada. Não tem preâmbulo, e a ementa começa por “Parecer sobre…”.",
		fundamento: "Anexo I, art. 53",
		timbre: 5,
		blocos: ["timbre", "epigrafe", "numeracao", "ementa", "texto", "signatario"],
		numeracao: "parecer",
		paragrafosNumerados: true,
		permiteFecho: false,
		ambitos: ["interno-om", "comaer"],
		dataNaLinha: "numeracao",
		aberturaSugerida: "Parecer sobre ",
	},
	{
		id: "ata",
		rotulo: "Ata",
		rotuloNumeracao: "Ata",
		descricao: "Registro de fatos e resoluções de assembleia, sessão ou reunião. Assinaturas em ordem de antiguidade, secretário por último.",
		fundamento: "Anexo I, art. 44",
		timbre: 5,
		blocos: ["timbre", "epigrafe", "titulo", "texto", "signatario"],
		numeracao: "nenhuma",
		paragrafosNumerados: true,
		permiteFecho: false,
		ambitos: ["interno-om", "comaer"],
		titulo: "ATA",
		dataNaLinha: "propria",
	},
	{
		id: "carta",
		rotulo: "Carta",
		rotuloNumeracao: "Carta",
		descricao: "Comunicação externa de caráter social dirigida a particular. Parágrafos sem numeração.",
		fundamento: "Anexo I, art. 45",
		timbre: 5,
		blocos: ["timbre", "epigrafe", "numeracao", "nup", "enderecamento", "vocativo", "texto", "fecho", "signatario", "rodape-om"],
		numeracao: "completa",
		paragrafosNumerados: false,
		permiteFecho: true,
		ambitos: ["externo"],
		dataNaLinha: "numeracao",
	},
	{
		id: "certidao",
		rotulo: "Certidão",
		rotuloNumeracao: "Certidão",
		descricao: "Certifica algo já registrado e comprovado. Texto abre por “Certifico, para fins de …”.",
		fundamento: "Anexo I, art. 46",
		timbre: 5,
		blocos: ["timbre", "epigrafe", "titulo", "texto", "localidade-data", "signatario", "rodape-om"],
		numeracao: "completa",
		paragrafosNumerados: false,
		permiteFecho: false,
		ambitos: ["interno-om", "comaer", "externo"],
		titulo: "CERTIDÃO",
		dataNaLinha: "propria",
		aberturaSugerida: "Certifico, para fins de ",
	},
	{
		id: "declaracao",
		rotulo: "Declaração",
		rotuloNumeracao: "Declaração",
		descricao: "Documento testemunhal com prazo de validade e finalidade declarados. Posto e cargo obrigatoriamente por extenso.",
		fundamento: "Anexo I, art. 47",
		timbre: 5,
		blocos: ["timbre", "epigrafe", "titulo", "texto", "localidade-data", "signatario", "rodape-om"],
		numeracao: "nenhuma",
		paragrafosNumerados: false,
		permiteFecho: false,
		ambitos: ["externo"],
		titulo: "DECLARAÇÃO",
		dataNaLinha: "propria",
		aberturaSugerida: "Declaro, para fins de ",
	},
	{
		id: "apostila",
		rotulo: "Apostila",
		rotuloNumeracao: "Apostila",
		descricao: "Averbação que corrige inexatidão ou completa registro de ato já publicado, sem alterar sua substância.",
		fundamento: "Anexo I, art. 43",
		timbre: 5,
		blocos: ["timbre", "titulo", "texto", "localidade-data", "signatario"],
		numeracao: "nenhuma",
		paragrafosNumerados: false,
		permiteFecho: false,
		ambitos: ["interno-om", "comaer"],
		titulo: "APOSTILA",
		dataNaLinha: "propria",
	},
	{
		id: "ordem-tecnica",
		rotulo: "Ordem Técnica",
		rotuloNumeracao: "Ordem Técnica",
		descricao: "Estabelece padrões e procedimentos técnicos: sumário, finalidade, âmbito, legislação e procedimentos.",
		fundamento: "Anexo I, art. 52",
		timbre: 5,
		blocos: ["timbre", "epigrafe", "titulo", "numeracao", "texto", "signatario"],
		numeracao: "completa",
		paragrafosNumerados: true,
		permiteFecho: false,
		ambitos: ["interno-om", "comaer"],
		titulo: "ORDEM TÉCNICA",
		dataNaLinha: "numeracao",
	},
]

export function buscarEspecie(id: string): Especie | undefined {
	return ESPECIES.find((e) => e.id === id)
}

/** Espécies compatíveis com o âmbito escolhido — evita oferecer fecho onde ele é proibido. */
export function especiesPorAmbito(ambito: Ambito): Especie[] {
	return ESPECIES.filter((e) => e.ambitos.includes(ambito))
}

/**
 * Catálogo em texto, para o prompt do modelo.
 *
 * Sai daqui, e não de uma lista escrita à mão no prompt, porque espécie nova no catálogo
 * tem de aparecer para o modelo no mesmo commit — uma cópia no prompt envelheceria em
 * silêncio, e o modelo continuaria escolhendo entre as espécies de ontem.
 */
export function descreverCatalogo(): string {
	return ESPECIES.map((e) => `- ${e.id} — ${e.rotulo} (${e.fundamento}). Âmbitos: ${e.ambitos.join(", ")}. ${e.descricao}`).join("\n")
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
export function conciliarEspecieAmbito(
	atual: { especie: string; ambito: Ambito },
	sugerido: { especie?: string; ambito?: Ambito }
): { especie: string; ambito: Ambito } {
	const especie = sugerido.especie && buscarEspecie(sugerido.especie) ? sugerido.especie : atual.especie
	const definicao = buscarEspecie(especie)
	if (!definicao) return atual

	const ambito = sugerido.ambito ?? atual.ambito
	if (definicao.ambitos.includes(ambito)) return { especie, ambito }
	// O âmbito sugerido não comporta a espécie: fica o primeiro que a norma admite para ela.
	return { especie, ambito: definicao.ambitos[0] }
}
