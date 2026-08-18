/**
 * Função de embedding usada pelo pipeline de ingestão.
 *
 * Fica isolada para que o pipeline seja testável sem rede: os testes passam uma
 * `EmbedFn` própria, a produção passa esta. O embedder em si vem de
 * `lib/embeddings.ts`, que também define o identificador gravado em cada chunk.
 */

import { env } from "../env.ts"
import { embeddingError, getEmbeddings } from "../lib/embeddings.ts"
import type { EmbedFn } from "./pipeline.ts"

export const embedDocuments: EmbedFn = async (texts) => {
	const embeddings = getEmbeddings()
	const vectors: number[][] = []

	for (let offset = 0; offset < texts.length; offset += env.EMB_BATCH_SIZE) {
		try {
			vectors.push(...(await embeddings.embedDocuments(texts.slice(offset, offset + env.EMB_BATCH_SIZE))))
		} catch (error) {
			throw embeddingError(error)
		}
	}

	return vectors
}
