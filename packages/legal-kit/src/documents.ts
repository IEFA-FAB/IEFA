import { createLegalClient, type LegalClient, type LegalConnection } from "./client.ts"
import { DEFAULT_LEGAL_LOCALE, isLegalDocType, type LegalDocType, type LegalDocument, type LegalLocale } from "./types.ts"

const SELECT = "id, doc_type, version, locale, content_md, effective_date, published_at"

/**
 * Linha da view `legal_documents_current`. Toda coluna é nullable no tipo gerado
 * (é assim que o PostgREST descreve views), então o normalizador abaixo é o único
 * ponto onde essa nulidade some.
 */
type CurrentRow = {
	id: string | null
	doc_type: string | null
	version: string | null
	locale: string | null
	content_md: string | null
	effective_date: string | null
	published_at: string | null
}

/**
 * Descarta a linha em vez de preencher com string vazia.
 *
 * Um documento legal com `content_md: ""` renderiza uma página em branco que
 * parece "sem conteúdo ainda" — e uma política de privacidade vazia é
 * indistinguível, para o usuário, de uma que não existe. Melhor cair no estado
 * "documento não encontrado", que é honesto sobre a falha.
 */
function normalize(row: CurrentRow | null): LegalDocument | null {
	if (!row) return null
	const { id, doc_type, version, locale, content_md, effective_date } = row
	if (!id || !doc_type || !version || !locale || !content_md || !effective_date) return null
	if (!isLegalDocType(doc_type)) return null
	return { id, doc_type, version, locale, content_md, effective_date, published_at: row.published_at }
}

export type FetchLegalDocumentOptions = LegalConnection & {
	docType: LegalDocType
	locale?: LegalLocale | string
	/** Reaproveita um client já criado (evita um `createClient` por documento). */
	client?: LegalClient
}

/**
 * Documento vigente de um tipo/locale, ou `null` se não houver versão publicada.
 *
 * Sem fallback automático de locale: servir a versão pt-BR para quem pediu en-US
 * seria pior que servir nada — o usuário leria um documento que não entende e
 * seguiria achando que foi informado. Quem quiser fallback decide no call site.
 */
export async function fetchLegalDocument({
	docType,
	locale = DEFAULT_LEGAL_LOCALE,
	client,
	...conn
}: FetchLegalDocumentOptions): Promise<LegalDocument | null> {
	const db = client ?? createLegalClient(conn)
	const { data, error } = await db.from("legal_documents_current").select(SELECT).eq("doc_type", docType).eq("locale", locale).maybeSingle()

	if (error) throw new Error(`legal-kit: falha ao ler ${docType} (${locale}): ${error.message}`)
	return normalize(data as CurrentRow | null)
}

export type FetchLegalDocumentsOptions = LegalConnection & {
	locale?: LegalLocale | string
	docTypes?: readonly LegalDocType[]
	client?: LegalClient
}

/** Todos os documentos vigentes de um locale, na ordem em que o PostgREST devolver. */
export async function fetchLegalDocuments({ locale = DEFAULT_LEGAL_LOCALE, docTypes, client, ...conn }: FetchLegalDocumentsOptions): Promise<LegalDocument[]> {
	const db = client ?? createLegalClient(conn)
	let query = db.from("legal_documents_current").select(SELECT).eq("locale", locale)
	if (docTypes?.length) query = query.in("doc_type", docTypes as string[])

	const { data, error } = await query
	if (error) throw new Error(`legal-kit: falha ao listar documentos (${locale}): ${error.message}`)

	return ((data ?? []) as CurrentRow[]).map(normalize).filter((doc): doc is LegalDocument => doc !== null)
}
