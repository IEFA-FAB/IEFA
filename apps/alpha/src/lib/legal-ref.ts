/**
 * Extração de referência legal a partir de texto corrido.
 *
 * Alimenta duas coisas: as notas explicativas dos modelos AGU (que citam o
 * dispositivo que fundamenta cada seção) e o guard de citação do verificador,
 * que descarta achado cuja referência não resolva contra a norma vigente.
 *
 * Exemplo real de nota da AGU:
 *   "A justificativa para o parcelamento ou não do objeto deve constar do
 *    Estudo Técnico Preliminar (art. 18, §1º, inciso VIII, da Lei nº 14.133,
 *    de 2021, e art. 9º, inciso I, do Decreto nº 11.246, de 2022)."
 * → dois refs: art. 18, § 1º, VIII da Lei 14.133/2021
 *              art. 9º, I do Decreto 11.246/2022
 */

import { cleanText, stripDiacritics } from "./text.ts"

export interface LegalRef {
	/** Norma canônica: 'Lei nº 14.133/2021', 'Decreto nº 11.246/2022', 'IN SEGES nº 65/2021'. */
	norma: string
	/** Dispositivo canônico: 'art. 18, § 1º, VIII'. */
	dispositivo: string
}

type NormaKind = "Lei" | "Lei Complementar" | "Decreto" | "IN SEGES"

interface NormaMention {
	norma: string
	start: number
}

/** "Lei nº 14.133, de 2021" · "Decreto 11.246/2022" · "Instrução Normativa SEGES nº 65, de 2021" */
const NORMA_PATTERN =
	/\b(lei(?:\s+complementar)?|decreto(?:-lei)?|instrucao\s+normativa(?:\s+seges)?|in\s+seges)\s*(?:n[º°o]?\.?\s*)?(\d{1,3}(?:\.\d{3})*)\s*(?:,?\s*de\s*(?:\d{1,2}\s+de\s+\w+\s+de\s+)?|\/)\s*(\d{4})/gi

/** "art. 18" · "artigo 6º" · "art. 75-A" */
const ARTIGO_PATTERN = /\bart(?:igo)?s?\.?\s*(\d+[º°o]?(?:-[a-z])?)/gi

/** Complementos que seguem o artigo: parágrafo, inciso, alínea. */
const PARAGRAFO_PATTERN = /(?:§+|paragrafos?)\s*(\d+[º°o]?|unico)/gi
const INCISO_PATTERN = /\bincisos?\s+([ivxlcdm]+)\b/gi
const ALINEA_PATTERN = /\bal[ií]neas?\s+["'“”]?([a-z])["'“”]?/gi

/** Distância máxima entre o artigo e a norma a que ele pertence, em caracteres. */
const MAX_ARTIGO_TO_NORMA_DISTANCE = 160

function normaLabel(kind: string): NormaKind {
	const normalized = stripDiacritics(kind).toLowerCase().replace(/\s+/g, " ")
	// "Lei Complementar" antes de "Lei": LC 123/2006 e LC 73/1993 aparecem nos
	// modelos da AGU e não são a mesma norma que uma lei ordinária de mesmo número.
	if (normalized.startsWith("lei complementar")) return "Lei Complementar"
	if (normalized.startsWith("lei")) return "Lei"
	if (normalized.startsWith("decreto")) return "Decreto"
	return "IN SEGES"
}

function canonicalNorma(kind: string, numero: string, ano: string): string {
	const label = normaLabel(kind)
	const digits = numero.replace(/\./g, "")
	const formatted = label === "IN SEGES" ? digits : Number(digits).toLocaleString("pt-BR")
	return `${label} nº ${formatted}/${ano}`
}

function ordinal(value: string): string {
	return value.replace(/[°o]$/i, "º")
}

function findNormaMentions(haystack: string): NormaMention[] {
	const mentions: NormaMention[] = []
	NORMA_PATTERN.lastIndex = 0
	let match = NORMA_PATTERN.exec(haystack)
	while (match) {
		mentions.push({ norma: canonicalNorma(match[1], match[2], match[3]), start: match.index })
		match = NORMA_PATTERN.exec(haystack)
	}
	return mentions
}

/** Complementos entre o fim do artigo e o início da norma citada logo depois. */
function describeDispositivo(artigo: string, tail: string): string {
	const parts = [`art. ${ordinal(artigo)}`]

	PARAGRAFO_PATTERN.lastIndex = 0
	const paragrafo = PARAGRAFO_PATTERN.exec(tail)
	if (paragrafo) parts.push(paragrafo[1].toLowerCase() === "unico" ? "parágrafo único" : `§ ${ordinal(paragrafo[1])}`)

	INCISO_PATTERN.lastIndex = 0
	const inciso = INCISO_PATTERN.exec(tail)
	if (inciso) parts.push(inciso[1].toUpperCase())

	ALINEA_PATTERN.lastIndex = 0
	const alinea = ALINEA_PATTERN.exec(tail)
	if (alinea) parts.push(`"${alinea[1].toLowerCase()}"`)

	return parts.join(", ")
}

/**
 * Extrai as referências legais de um texto.
 *
 * Cada artigo é ligado à primeira norma mencionada depois dele, dentro de uma
 * janela curta — é como a redação jurídica encadeia ("art. X, da Lei Y"). Artigo
 * sem norma na janela é descartado: referência sem norma não resolve contra nada
 * e viraria ruído no guard de citação.
 */
export function extractLegalRefs(rawText: string): LegalRef[] {
	const text = cleanText(rawText)
	const searchable = stripDiacritics(text)
	const mentions = findNormaMentions(searchable)
	if (mentions.length === 0) return []

	const refs: LegalRef[] = []
	const seen = new Set<string>()

	ARTIGO_PATTERN.lastIndex = 0
	let match = ARTIGO_PATTERN.exec(searchable)
	while (match) {
		const artigoStart = match.index
		const artigoEnd = artigoStart + match[0].length
		const norma = mentions.find((mention) => mention.start >= artigoStart && mention.start - artigoEnd <= MAX_ARTIGO_TO_NORMA_DISTANCE)

		if (norma) {
			const dispositivo = describeDispositivo(match[1], searchable.slice(artigoEnd, norma.start))
			const key = `${norma.norma}|${dispositivo}`
			if (!seen.has(key)) {
				seen.add(key)
				refs.push({ norma: norma.norma, dispositivo })
			}
		}

		match = ARTIGO_PATTERN.exec(searchable)
	}

	return refs
}
