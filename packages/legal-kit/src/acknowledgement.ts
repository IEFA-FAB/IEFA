import { createLegalClient, type LegalConnection } from "./client.ts"
import { fetchLegalDocuments } from "./documents.ts"
import { DEFAULT_LEGAL_LOCALE, type LegalDocType, type LegalDocumentAcknowledgement, type LegalLocale } from "./types.ts"

export type PendingAcknowledgementOptions = LegalConnection & {
	/** SEMPRE o id da sessão validada no servidor. Nunca um id vindo do cliente. */
	userId: string
	locale?: LegalLocale | string
	docTypes?: readonly LegalDocType[]
}

/**
 * Documentos vigentes que o usuário ainda não marcou como lidos.
 *
 * O registro é por `document_id`, não por `doc_type`: publicar uma versão nova
 * cria uma linha nova em `legal_documents`, então a ciência da versão anterior
 * deixa de valer sozinha — que é exatamente o comportamento desejado quando a
 * política muda.
 */
export async function listPendingAcknowledgements({
	userId,
	locale = DEFAULT_LEGAL_LOCALE,
	docTypes,
	...conn
}: PendingAcknowledgementOptions): Promise<LegalDocumentAcknowledgement[]> {
	const client = createLegalClient(conn)
	const documents = await fetchLegalDocuments({ ...conn, client, locale, docTypes })
	if (documents.length === 0) return []

	const { data, error } = await client
		.from("user_legal_acceptances")
		.select("document_id, accepted_at")
		.eq("user_id", userId)
		.in(
			"document_id",
			documents.map((doc) => doc.id)
		)

	if (error) throw new Error(`legal-kit: falha ao ler ciência do usuário: ${error.message}`)

	const rows = (data ?? []) as { document_id: string; accepted_at: string }[]
	const acceptedAt = new Map(rows.map((row) => [row.document_id, row.accepted_at]))
	return documents.map((document) => ({ document, acknowledgedAt: acceptedAt.get(document.id) ?? null }))
}

export type RecordAcknowledgementOptions = LegalConnection & {
	/** SEMPRE o id da sessão validada no servidor. Nunca um id vindo do cliente. */
	userId: string
	/** Ids de `legal_documents`. Ids desconhecidos são descartados antes do insert. */
	documentIds: readonly string[]
	locale?: LegalLocale | string
	/** Evidência do registro. Coleta declarada na Política de Privacidade. */
	ipAddress?: string | null
	userAgent?: string | null
}

/**
 * Registra ciência das versões vigentes.
 *
 * Filtra os ids contra a view de documentos vigentes antes de inserir: sem isso,
 * um cliente poderia gravar ciência de um rascunho ou de uma versão revogada, e o
 * registro — cujo único propósito é provar o que foi mostrado — passaria a
 * afirmar algo que nunca aconteceu.
 *
 * `ignoreDuplicates` mantém o PRIMEIRO `accepted_at`. Reciência não pode reescrever
 * a data original: seria antedatar a evidência ao contrário, empurrando a ciência
 * para frente a cada login.
 *
 * @returns ids efetivamente aceitos (já registrados antes contam como aceitos).
 */
export async function recordAcknowledgement({
	userId,
	documentIds,
	locale = DEFAULT_LEGAL_LOCALE,
	ipAddress = null,
	userAgent = null,
	...conn
}: RecordAcknowledgementOptions): Promise<string[]> {
	if (documentIds.length === 0) return []

	const client = createLegalClient(conn)
	const current = await fetchLegalDocuments({ ...conn, client, locale })
	const currentIds = new Set(current.map((doc) => doc.id))
	const valid = [...new Set(documentIds)].filter((id) => currentIds.has(id))
	if (valid.length === 0) return []

	const { error } = await client.from("user_legal_acceptances").upsert(
		valid.map((document_id) => ({
			user_id: userId,
			document_id,
			ip_address: ipAddress,
			user_agent: userAgent,
		})),
		{ onConflict: "user_id,document_id", ignoreDuplicates: true }
	)

	if (error) throw new Error(`legal-kit: falha ao registrar ciência: ${error.message}`)
	return valid
}
