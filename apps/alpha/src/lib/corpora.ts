/**
 * `alpha.document` guarda dois corpora na MESMA tabela: a legislação
 * aeronáutica e a legislação federal de contratações (mais os modelos da AGU).
 * Quem recupera tem de dizer de qual corpus está falando — sem isso o ChatRADA
 * responde uma pergunta sobre o RADA com trecho da Lei 14.133, e o verificador
 * de conformidade julga uma regra da 14.133 contra uma norma aeronáutica.
 */
export const AERONAUTICAL_DOCUMENT_TYPES = ["RADA", "RBHA", "ICA", "MCA", "NSCA"] as const

/** Corpus que embasa o verificador de conformidade (Lei 14.133 e regulamento). */
export const FEDERAL_LEGISLATION_TYPES = ["LEI", "DECRETO", "IN_SEGES"] as const

/** Modelo de minuta da AGU — não é norma, não embasa julgamento de regra. */
export const TEMPLATE_DOCUMENT_TYPES = ["MODELO_AGU"] as const

export type AeronauticalDocumentType = (typeof AERONAUTICAL_DOCUMENT_TYPES)[number]
export type FederalLegislationType = (typeof FEDERAL_LEGISLATION_TYPES)[number]
export type DocumentType = AeronauticalDocumentType | FederalLegislationType | (typeof TEMPLATE_DOCUMENT_TYPES)[number]

const KNOWN_DOCUMENT_TYPES: readonly string[] = [...AERONAUTICAL_DOCUMENT_TYPES, ...FEDERAL_LEGISLATION_TYPES, ...TEMPLATE_DOCUMENT_TYPES]

/**
 * Devolve `null` para valor que não reconhecemos, em vez de assumir um tipo.
 * O default anterior era `"RADA"`, que carimbava norma federal como
 * aeronáutica — mentira mais cara que a ausência do rótulo.
 */
export function toDocumentType(value: unknown): DocumentType | null {
	return typeof value === "string" && KNOWN_DOCUMENT_TYPES.includes(value) ? (value as DocumentType) : null
}
