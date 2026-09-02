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

export type Force = "aer" | "eb" | "mb"

export interface Rank {
	/** Forma abreviada, como no art. 18. */
	acronym: string
	/** Forma por extenso, obrigatória em documento externo ao COMAER (art. 26). */
	inFull: string
	force: Force
	category: "posto" | "graduacao"
	/** Oficial-General: o posto PRECEDE o nome na identificação do signatário (art. 40). */
	generalOfficer?: true
}

export const RANKS: readonly Rank[] = [
	// ── Aeronáutica — postos ──
	{ acronym: "Mar Ar", inFull: "Marechal do Ar", force: "aer", category: "posto", generalOfficer: true },
	{ acronym: "Ten Brig", inFull: "Tenente-Brigadeiro", force: "aer", category: "posto", generalOfficer: true },
	{ acronym: "Maj Brig", inFull: "Major-Brigadeiro", force: "aer", category: "posto", generalOfficer: true },
	{ acronym: "Brig", inFull: "Brigadeiro", force: "aer", category: "posto", generalOfficer: true },
	{ acronym: "Cel", inFull: "Coronel", force: "aer", category: "posto" },
	{ acronym: "Ten Cel", inFull: "Tenente-Coronel", force: "aer", category: "posto" },
	{ acronym: "Maj", inFull: "Major", force: "aer", category: "posto" },
	{ acronym: "Cap", inFull: "Capitão", force: "aer", category: "posto" },
	{ acronym: "1º Ten", inFull: "Primeiro-Tenente", force: "aer", category: "posto" },
	{ acronym: "2º Ten", inFull: "Segundo-Tenente", force: "aer", category: "posto" },
	{ acronym: "Asp", inFull: "Aspirante a Oficial", force: "aer", category: "posto" },
	// ── Aeronáutica — graduações ──
	{ acronym: "Cad", inFull: "Cadete", force: "aer", category: "graduacao" },
	{ acronym: "SO", inFull: "Suboficial", force: "aer", category: "graduacao" },
	{ acronym: "1S", inFull: "Primeiro-Sargento", force: "aer", category: "graduacao" },
	{ acronym: "2S", inFull: "Segundo-Sargento", force: "aer", category: "graduacao" },
	{ acronym: "3S", inFull: "Terceiro-Sargento", force: "aer", category: "graduacao" },
	{ acronym: "Cb", inFull: "Cabo", force: "aer", category: "graduacao" },
	{ acronym: "S1", inFull: "Soldado de Primeira-Classe", force: "aer", category: "graduacao" },
	{ acronym: "S2", inFull: "Soldado de Segunda-Classe", force: "aer", category: "graduacao" },
	{ acronym: "TM", inFull: "Taifeiro-Mor", force: "aer", category: "graduacao" },
	{ acronym: "T1", inFull: "Taifeiro de Primeira-Classe", force: "aer", category: "graduacao" },
	{ acronym: "T2", inFull: "Taifeiro de Segunda-Classe", force: "aer", category: "graduacao" },
	{ acronym: "Al", inFull: "Aluno", force: "aer", category: "graduacao" },
	// ── Exército — postos e graduações (usados na menção a pessoal, art. 23) ──
	{ acronym: "Mar", inFull: "Marechal", force: "eb", category: "posto", generalOfficer: true },
	{ acronym: "Gen Ex", inFull: "General de Exército", force: "eb", category: "posto", generalOfficer: true },
	{ acronym: "Gen Div", inFull: "General de Divisão", force: "eb", category: "posto", generalOfficer: true },
	{ acronym: "Gen Bda", inFull: "General de Brigada", force: "eb", category: "posto", generalOfficer: true },
	{ acronym: "Ten Cel (EB)", inFull: "Tenente-Coronel", force: "eb", category: "posto" },
	{ acronym: "S Ten", inFull: "Subtenente", force: "eb", category: "graduacao" },
	{ acronym: "1º Sgt", inFull: "Primeiro-Sargento", force: "eb", category: "graduacao" },
	{ acronym: "2º Sgt", inFull: "Segundo-Sargento", force: "eb", category: "graduacao" },
	{ acronym: "3º Sgt", inFull: "Terceiro-Sargento", force: "eb", category: "graduacao" },
	{ acronym: "Sd", inFull: "Soldado", force: "eb", category: "graduacao" },
	// ── Marinha — postos e graduações ──
	{ acronym: "Alte", inFull: "Almirante", force: "mb", category: "posto", generalOfficer: true },
	{ acronym: "Alte Esq", inFull: "Almirante de Esquadra", force: "mb", category: "posto", generalOfficer: true },
	{ acronym: "V Alte", inFull: "Vice-Almirante", force: "mb", category: "posto", generalOfficer: true },
	{ acronym: "C Alte", inFull: "Contra-Almirante", force: "mb", category: "posto", generalOfficer: true },
	{ acronym: "CMG", inFull: "Capitão de Mar e Guerra", force: "mb", category: "posto" },
	{ acronym: "CF", inFull: "Capitão de Fragata", force: "mb", category: "posto" },
	{ acronym: "CC", inFull: "Capitão de Corveta", force: "mb", category: "posto" },
	{ acronym: "CT", inFull: "Capitão-Tenente", force: "mb", category: "posto" },
	{ acronym: "GM", inFull: "Guarda-Marinha", force: "mb", category: "posto" },
	{ acronym: "1º SG", inFull: "Primeiro-Sargento", force: "mb", category: "graduacao" },
	{ acronym: "2º SG", inFull: "Segundo-Sargento", force: "mb", category: "graduacao" },
	{ acronym: "3º SG", inFull: "Terceiro-Sargento", force: "mb", category: "graduacao" },
	{ acronym: "MN", inFull: "Marinheiro", force: "mb", category: "graduacao" },
]

/**
 * Quadros e especialidades por extenso.
 *
 * A norma NÃO publica uma tabela de quadro por extenso — ela dá exemplos soltos
 * ("Coronel Aviador" no art. 40, "Primeiro-Tenente Intendente" no art. 32 § 6º). Por isso
 * o que não está aqui volta na própria sigla em vez de virar chute: escrever o quadro
 * errado por extenso num ofício externo é pior do que deixá-lo abreviado.
 */
export const QUADROS_IN_FULL: Readonly<Record<string, string>> = {
	Ar: "do Ar",
	Av: "Aviador",
	Int: "Intendente",
	Eng: "Engenheiro",
	Med: "Médico",
	Dent: "Dentista",
	Farm: "Farmacêutico",
	Capl: "Capelão",
}

function lookupKey(acronym: string): string {
	return (
		acronym
			// NFKD (não NFD): é a forma que decompõe o indicador ordinal "º" em "o". Com NFD
			// ele passa intacto, e era por isso que "1º Ten" e "1o Ten" produziam chaves
			// diferentes — a busca "tolerante" documentada logo abaixo não tolerava nada.
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			// "1o Ten", "1oTen" e "1 Ten" viram a mesma coisa. O "o" só cai depois de dígito
			// — senão "Cabo" e "Suboficial" seriam mutilados — e sem exigir fronteira de
			// palavra, que não existe em "1oTen".
			.replace(/(\d)\s*o/gi, "$1")
			.replace(/[.\s]/g, "")
			.toLowerCase()
	)
}

/** Busca tolerante: aceita "1º Ten", "1o Ten", "1 TEN" e "ten cel". */
export function findRank(acronym: string, force: Force = "aer"): Rank | undefined {
	const alvo = lookupKey(acronym)
	return RANKS.find((p) => p.force === force && lookupKey(p.acronym) === alvo) ?? RANKS.find((p) => lookupKey(p.acronym) === alvo)
}

/** Posto por extenso (art. 26) — devolve a própria entrada quando desconhecida. */
export function rankInFull(acronym: string, force: Force = "aer"): string {
	return findRank(acronym, force)?.inFull ?? acronym
}

export function quadroInFull(acronym: string): string {
	return QUADROS_IN_FULL[acronym] ?? acronym
}

/** Art. 40: só para Oficial-General o posto precede o nome. */
export function isGeneralOfficer(acronym: string, force: Force = "aer"): boolean {
	return findRank(acronym, force)?.generalOfficer === true
}
