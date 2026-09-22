/**
 * Corpora que o chat oferece ao modelo, e o formato de um trecho devolvido. Separado de
 * `norm-search.ts` para o laço do agente ser testável sem env nem banco.
 */

import { AERONAUTICAL_DOCUMENT_TYPES, type DocumentType, FEDERAL_LEGISLATION_TYPES, TEMPLATE_DOCUMENT_TYPES } from "../lib/corpora.ts"

export const CHAT_CORPORA = {
	legislacao: FEDERAL_LEGISLATION_TYPES,
	modelos_agu: TEMPLATE_DOCUMENT_TYPES,
	aeronautico: AERONAUTICAL_DOCUMENT_TYPES,
} as const satisfies Record<string, readonly DocumentType[]>

export type ChatCorpus = keyof typeof CHAT_CORPORA

export interface NormHit {
	chunk_id: string
	content: string
	/** Nome do documento quando o chunk o traz — o corpus federal não traz (ver `/chunks/:id`). */
	source: string | null
	/** Capítulo/seção/artigo, na ordem em que o chunk os informa. */
	locator: string
}
