/**
 * `buscar_norma` do chat: o `radaRetriever` com o corpus que o modelo escolheu, sempre
 * declarado — o contrato `corpora.contract.test.ts` reprova chamada sem `document_type`.
 */

import { radaRetriever } from "../tools/rada-retriever.ts"
import { CHAT_CORPORA, type ChatCorpus, type NormHit } from "./corpus.ts"

/** Trechos por busca: o suficiente para fundamentar sem inflar o prompt do turno. */
const TOP_K = 6

export async function searchNorms(query: string, corpus: ChatCorpus): Promise<{ hits: NormHit[]; unavailable: boolean }> {
	const result = await radaRetriever({ query, filters: { document_type: CHAT_CORPORA[corpus] }, top_k: TOP_K })
	const hits = result.documents.map((doc) => ({
		chunk_id: doc.id,
		content: doc.content,
		source: doc.metadata.source || null,
		// No corpus federal o `chapter` guarda o caput INTEIRO do artigo — corta para rótulo.
		locator: [doc.metadata.chapter, doc.metadata.section, doc.metadata.article].filter(Boolean).join(" · ").slice(0, 160),
	}))
	return { hits, unavailable: hits.length === 0 && result.search_metadata.semantic_unavailable }
}
