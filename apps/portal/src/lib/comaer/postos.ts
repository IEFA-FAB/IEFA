/**
 * @module comaer/postos
 * Postos e graduações das três Forças, conforme NSCA 5-3/2026, Anexo I, art. 18.
 *
 * Existe porque a norma trata a forma abreviada e a forma por extenso como coisas
 * DIFERENTES, escolhidas pelo âmbito do documento: o art. 26 manda grafar posto por
 * extenso quando o documento sai do COMAER, e o art. 40 § 2º faz o mesmo com cargo e
 * OM. Sem a tabela, quem redige teria que lembrar que "1º Ten" vira "Primeiro-Tenente"
 * só no ofício externo — e é exatamente o tipo de detalhe que passa batido.
 */

export type Forca = "aer" | "eb" | "mb"

export interface PostoGraduacao {
	/** Forma abreviada, como no art. 18. */
	sigla: string
	/** Forma por extenso, obrigatória em documento externo ao COMAER (art. 26). */
	extenso: string
	forca: Forca
	tipo: "posto" | "graduacao"
	/** Oficial-General: o posto PRECEDE o nome na identificação do signatário (art. 40). */
	oficialGeneral?: true
}

export const POSTOS_GRADUACOES: readonly PostoGraduacao[] = [
	// ── Aeronáutica — postos ──
	{ sigla: "Mar Ar", extenso: "Marechal do Ar", forca: "aer", tipo: "posto", oficialGeneral: true },
	{ sigla: "Ten Brig", extenso: "Tenente-Brigadeiro", forca: "aer", tipo: "posto", oficialGeneral: true },
	{ sigla: "Maj Brig", extenso: "Major-Brigadeiro", forca: "aer", tipo: "posto", oficialGeneral: true },
	{ sigla: "Brig", extenso: "Brigadeiro", forca: "aer", tipo: "posto", oficialGeneral: true },
	{ sigla: "Cel", extenso: "Coronel", forca: "aer", tipo: "posto" },
	{ sigla: "Ten Cel", extenso: "Tenente-Coronel", forca: "aer", tipo: "posto" },
	{ sigla: "Maj", extenso: "Major", forca: "aer", tipo: "posto" },
	{ sigla: "Cap", extenso: "Capitão", forca: "aer", tipo: "posto" },
	{ sigla: "1º Ten", extenso: "Primeiro-Tenente", forca: "aer", tipo: "posto" },
	{ sigla: "2º Ten", extenso: "Segundo-Tenente", forca: "aer", tipo: "posto" },
	{ sigla: "Asp", extenso: "Aspirante a Oficial", forca: "aer", tipo: "posto" },
	// ── Aeronáutica — graduações ──
	{ sigla: "Cad", extenso: "Cadete", forca: "aer", tipo: "graduacao" },
	{ sigla: "SO", extenso: "Suboficial", forca: "aer", tipo: "graduacao" },
	{ sigla: "1S", extenso: "Primeiro-Sargento", forca: "aer", tipo: "graduacao" },
	{ sigla: "2S", extenso: "Segundo-Sargento", forca: "aer", tipo: "graduacao" },
	{ sigla: "3S", extenso: "Terceiro-Sargento", forca: "aer", tipo: "graduacao" },
	{ sigla: "Cb", extenso: "Cabo", forca: "aer", tipo: "graduacao" },
	{ sigla: "S1", extenso: "Soldado de Primeira-Classe", forca: "aer", tipo: "graduacao" },
	{ sigla: "S2", extenso: "Soldado de Segunda-Classe", forca: "aer", tipo: "graduacao" },
	{ sigla: "TM", extenso: "Taifeiro-Mor", forca: "aer", tipo: "graduacao" },
	{ sigla: "T1", extenso: "Taifeiro de Primeira-Classe", forca: "aer", tipo: "graduacao" },
	{ sigla: "T2", extenso: "Taifeiro de Segunda-Classe", forca: "aer", tipo: "graduacao" },
	{ sigla: "Al", extenso: "Aluno", forca: "aer", tipo: "graduacao" },
	// ── Exército — postos e graduações (usados na menção a pessoal, art. 23) ──
	{ sigla: "Mar", extenso: "Marechal", forca: "eb", tipo: "posto", oficialGeneral: true },
	{ sigla: "Gen Ex", extenso: "General de Exército", forca: "eb", tipo: "posto", oficialGeneral: true },
	{ sigla: "Gen Div", extenso: "General de Divisão", forca: "eb", tipo: "posto", oficialGeneral: true },
	{ sigla: "Gen Bda", extenso: "General de Brigada", forca: "eb", tipo: "posto", oficialGeneral: true },
	{ sigla: "Ten Cel (EB)", extenso: "Tenente-Coronel", forca: "eb", tipo: "posto" },
	{ sigla: "S Ten", extenso: "Subtenente", forca: "eb", tipo: "graduacao" },
	{ sigla: "1º Sgt", extenso: "Primeiro-Sargento", forca: "eb", tipo: "graduacao" },
	{ sigla: "2º Sgt", extenso: "Segundo-Sargento", forca: "eb", tipo: "graduacao" },
	{ sigla: "3º Sgt", extenso: "Terceiro-Sargento", forca: "eb", tipo: "graduacao" },
	{ sigla: "Sd", extenso: "Soldado", forca: "eb", tipo: "graduacao" },
	// ── Marinha — postos e graduações ──
	{ sigla: "Alte", extenso: "Almirante", forca: "mb", tipo: "posto", oficialGeneral: true },
	{ sigla: "Alte Esq", extenso: "Almirante de Esquadra", forca: "mb", tipo: "posto", oficialGeneral: true },
	{ sigla: "V Alte", extenso: "Vice-Almirante", forca: "mb", tipo: "posto", oficialGeneral: true },
	{ sigla: "C Alte", extenso: "Contra-Almirante", forca: "mb", tipo: "posto", oficialGeneral: true },
	{ sigla: "CMG", extenso: "Capitão de Mar e Guerra", forca: "mb", tipo: "posto" },
	{ sigla: "CF", extenso: "Capitão de Fragata", forca: "mb", tipo: "posto" },
	{ sigla: "CC", extenso: "Capitão de Corveta", forca: "mb", tipo: "posto" },
	{ sigla: "CT", extenso: "Capitão-Tenente", forca: "mb", tipo: "posto" },
	{ sigla: "GM", extenso: "Guarda-Marinha", forca: "mb", tipo: "posto" },
	{ sigla: "1º SG", extenso: "Primeiro-Sargento", forca: "mb", tipo: "graduacao" },
	{ sigla: "2º SG", extenso: "Segundo-Sargento", forca: "mb", tipo: "graduacao" },
	{ sigla: "3º SG", extenso: "Terceiro-Sargento", forca: "mb", tipo: "graduacao" },
	{ sigla: "MN", extenso: "Marinheiro", forca: "mb", tipo: "graduacao" },
]

/**
 * Quadros e especialidades por extenso.
 *
 * A norma NÃO publica uma tabela de quadro por extenso — ela dá exemplos soltos
 * ("Coronel Aviador" no art. 40, "Primeiro-Tenente Intendente" no art. 32 § 6º). Por isso
 * o que não está aqui volta na própria sigla em vez de virar chute: escrever o quadro
 * errado por extenso num ofício externo é pior do que deixá-lo abreviado.
 */
export const QUADROS_POR_EXTENSO: Readonly<Record<string, string>> = {
	Ar: "do Ar",
	Av: "Aviador",
	Int: "Intendente",
	Eng: "Engenheiro",
	Med: "Médico",
	Dent: "Dentista",
	Farm: "Farmacêutico",
	Capl: "Capelão",
}

function chave(sigla: string): string {
	return sigla
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[.\s]/g, "")
		.replace(/o$/i, "")
		.toLowerCase()
}

/** Busca tolerante: aceita "1º Ten", "1o Ten", "1 TEN" e "ten cel". */
export function buscarPosto(sigla: string, forca: Forca = "aer"): PostoGraduacao | undefined {
	const alvo = chave(sigla)
	return POSTOS_GRADUACOES.find((p) => p.forca === forca && chave(p.sigla) === alvo) ?? POSTOS_GRADUACOES.find((p) => chave(p.sigla) === alvo)
}

/** Posto por extenso (art. 26) — devolve a própria entrada quando desconhecida. */
export function postoPorExtenso(sigla: string, forca: Forca = "aer"): string {
	return buscarPosto(sigla, forca)?.extenso ?? sigla
}

export function quadroPorExtenso(sigla: string): string {
	return QUADROS_POR_EXTENSO[sigla] ?? sigla
}

/** Art. 40: só para Oficial-General o posto precede o nome. */
export function isOficialGeneral(sigla: string, forca: Forca = "aer"): boolean {
	return buscarPosto(sigla, forca)?.oficialGeneral === true
}
