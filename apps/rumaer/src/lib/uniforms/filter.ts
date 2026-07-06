import { CATEGORIA_LABELS, EQ_CIVIL_LABELS, GRUPO_LABELS, uniformTitle } from "@/lib/uniforms/labels"
import type { UniformListItem } from "@/server/uniforms.fn"

/**
 * Normaliza texto para busca: minúsculas, sem acentos, sem pontuação/ordinais
 * (º/ª/°), tudo separado por espaço único. Assim "Educação Física" → "educacao
 * fisica" e "5º" → "5".
 */
export function normalizeSearch(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

/** Número do uniforme → formas por extenso (ordinal + cardinal) que a pessoa pode digitar. */
const NUMBER_WORDS: Record<number, string> = {
	1: "primeiro um",
	2: "segundo dois",
	3: "terceiro tres",
	4: "quarto quatro",
	5: "quinto cinco",
	6: "sexto seis",
	7: "setimo sete",
	8: "oitavo oito",
	9: "nono nove",
	10: "decimo dez",
	11: "decimo primeiro onze",
	12: "decimo segundo doze",
	13: "decimo terceiro treze",
	14: "decimo quarto quatorze catorze",
	15: "decimo quinto quinze",
	16: "decimo sexto dezesseis",
	17: "decimo setimo dezessete",
}

/**
 * Apelidos populares → uniforme(s) que designam. `match` recebe o uniforme para
 * permitir apelidos específicos de número+letra (ex.: 11B). Genéricos derivam de
 * prefixo de palavra: "macacao" casa "macacao verde" e "macacao azul".
 */
const NICKNAMES: { termos: string; match: (u: UniformListItem) => boolean }[] = [
	{ termos: "homem bala", match: (u) => u.numero === 16 || u.numero === 17 },
	{ termos: "camuflado", match: (u) => u.numero === 10 },
	{ termos: "macacao verde", match: (u) => u.numero === 8 },
	{ termos: "macacao azul", match: (u) => u.numero === 11 && u.letra?.toUpperCase() === "B" },
	{ termos: "saude", match: (u) => u.numero === 13 },
]

/**
 * Texto pesquisável (normalizado) de um uniforme — campos oficiais + formas
 * alternativas (número por extenso, apelidos) para tolerar buscas informais.
 */
export function uniformHaystack(u: UniformListItem): string {
	const parts = [
		uniformTitle(u),
		u.nome,
		u.traje ?? "",
		u.subgrupo ?? "",
		u.art_referencia ?? "",
		u.eq_eb ?? "",
		u.eq_mb ?? "",
		u.eq_civil ? EQ_CIVIL_LABELS[u.eq_civil] : "",
		GRUPO_LABELS[u.grupo],
		...u.categories.map((c) => CATEGORIA_LABELS[c.categoria]),
	]
	if (u.numero != null && NUMBER_WORDS[u.numero]) parts.push(NUMBER_WORDS[u.numero])
	for (const n of NICKNAMES) if (n.match(u)) parts.push(n.termos)
	return normalizeSearch(parts.join(" "))
}

/** Um token da busca casa com o uniforme? Trata formas numéricas de modo preciso e texto por prefixo de palavra. */
function tokenMatches(u: UniformListItem, hayWords: string[], tok: string): boolean {
	// "5o", "16o" — forma ordinal abreviada → número exato
	const ordinal = tok.match(/^(\d{1,2})o$/)
	if (ordinal) return u.numero === Number(ordinal[1])
	// "5a", "7b" — forma contraída número+letra → número e letra exatos
	const contracted = tok.match(/^(\d{1,2})([a-e])$/)
	if (contracted) return u.numero === Number(contracted[1]) && (u.letra?.toLowerCase() ?? "") === contracted[2]
	// "5", "16" — número puro → número exato (evita casar "5" dentro de "15")
	const pure = tok.match(/^(\d{1,2})$/)
	if (pure) return u.numero === Number(pure[1])
	// texto (inclui extenso e apelidos, via haystack) — prefixo de palavra
	return hayWords.some((w) => w.startsWith(tok))
}

/**
 * O uniforme casa com a busca? Cada palavra da consulta precisa casar (AND),
 * suportando número (`5`, `5o`, `5a`/`7b`), por extenso (`quinto`), apelidos
 * (`homem bala`) e prefixos (`repres` → representação), tudo sem acento.
 */
export function uniformMatchesQuery(u: UniformListItem, rawQuery: string): boolean {
	const q = normalizeSearch(rawQuery)
	if (!q) return true
	const hayWords = uniformHaystack(u).split(" ")
	return q.split(" ").every((tok) => tokenMatches(u, hayWords, tok))
}
