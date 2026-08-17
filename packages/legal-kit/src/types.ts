/** Tipos de documento legal publicados em `iefa.legal_documents`. */
export type LegalDocType = "terms_of_use" | "privacy_policy" | "cookie_policy"

export const LEGAL_DOC_TYPES = ["terms_of_use", "privacy_policy", "cookie_policy"] as const satisfies readonly LegalDocType[]

/** Locales com documento publicado. `pt-BR` é o texto de referência; `en-US` é tradução. */
export type LegalLocale = "pt-BR" | "en-US"

export const LEGAL_LOCALES = ["pt-BR", "en-US"] as const satisfies readonly LegalLocale[]

export const DEFAULT_LEGAL_LOCALE: LegalLocale = "pt-BR"

export function isLegalDocType(value: string): value is LegalDocType {
	return (LEGAL_DOC_TYPES as readonly string[]).includes(value)
}

/**
 * Rota canônica de cada documento, por locale.
 *
 * Padronizada em todos os apps: um link de rodapé quebra em silêncio quando cada
 * app inventa o próprio caminho, e o rodapé é o único lugar onde a maioria dos
 * usuários encontra estes documentos.
 */
export const LEGAL_DOC_PATHS = {
	"pt-BR": {
		terms_of_use: "/termos-de-uso",
		privacy_policy: "/politica-de-privacidade",
		cookie_policy: "/politica-de-cookies",
	},
	"en-US": {
		terms_of_use: "/terms-of-use",
		privacy_policy: "/privacy-policy",
		cookie_policy: "/cookie-policy",
	},
} as const satisfies Record<LegalLocale, Record<LegalDocType, string>>

export const LEGAL_DOC_TITLES = {
	"pt-BR": {
		terms_of_use: "Termos de Uso",
		privacy_policy: "Política de Privacidade",
		cookie_policy: "Política de Cookies",
	},
	"en-US": {
		terms_of_use: "Terms of Use",
		privacy_policy: "Privacy Policy",
		cookie_policy: "Cookie Policy",
	},
} as const satisfies Record<LegalLocale, Record<LegalDocType, string>>

export type LegalDocument = {
	id: string
	doc_type: LegalDocType
	version: string
	locale: string
	content_md: string
	effective_date: string
	published_at: string | null
}

/** Documento vigente + se o usuário já registrou ciência daquela versão. */
export type LegalDocumentAcknowledgement = {
	document: LegalDocument
	acknowledgedAt: string | null
}
