/**
 * Normalização de texto compartilhada entre ingestão e comparação estrutural.
 *
 * O casamento de seções (Etapa 1.5) compara título de documento submetido com
 * título de modelo AGU. A numeração e a caixa variam livremente entre os dois
 * ("4 - DA JUSTIFICATIVA" vs "4. Da Justificativa"), então a forma normalizada
 * é o que fica persistido em `structure_node.title_norm`.
 */

/** Marcas de combinação Unicode, resultado do normalize("NFD"). */
const COMBINING_MARKS = /[̀-ͯ]/g

/** Espaço não separável e demais espaços exóticos que o Word insere. */
const EXOTIC_SPACE = /[  -​  　]/g

/** Numeração arábica no início do título: "4 - ", "4.1 ", "Art. 3º ", "1.3.2. ". */
const NUMERIC_PREFIX = /^\s*(?:art(?:igo)?\.?\s*)?\d+(?:[.\-–]\d+)*[º°ª]?\s*(?:[.\-–)]\s*|\s+)/i

/**
 * Numeração romana no início do título: "IV - ", "V) ".
 *
 * O separador é obrigatório e a comparação é feita antes de baixar a caixa —
 * sem isso, "CONDIÇÕES GERAIS" perde o "CO" inicial, porque C e O são
 * algarismos romanos válidos.
 */
const ROMAN_PREFIX = /^\s*[IVXLCDM]+\s*[.\-–)]\s+/

export function stripDiacritics(value: string): string {
	return value.normalize("NFD").replace(COMBINING_MARKS, "")
}

export function normalizeTitle(raw: string): string {
	const withoutDiacritics = stripDiacritics(raw.replace(EXOTIC_SPACE, " "))
	const withoutNumbering = withoutDiacritics.replace(NUMERIC_PREFIX, "").replace(ROMAN_PREFIX, "")
	return withoutNumbering
		.toLowerCase()
		.replace(/[.,;:]+$/, "")
		.replace(/\s+/g, " ")
		.trim()
}

/** Limpeza de texto corrido vindo do OOXML — sem normalizar caixa nem acento. */
export function cleanText(raw: string): string {
	return raw.replace(EXOTIC_SPACE, " ").replace(/\s+/g, " ").trim()
}

/** Estimativa de tokens usada para dimensionar chunk (mesma heurística da ingestão markdown). */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4)
}
