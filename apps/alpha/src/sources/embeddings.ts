/**
 * Função de embedding usada pelo pipeline de ingestão.
 *
 * Fica isolada para que o pipeline seja testável sem rede: os testes passam uma
 * `EmbedFn` própria, a produção passa esta.
 */

import { OpenAIEmbeddings } from "@langchain/openai"
import { env } from "../env.ts"
import type { EmbedFn } from "./pipeline.ts"

const embeddings = new OpenAIEmbeddings({
	model: env.EMB_MODEL,
	configuration: {
		baseURL: env.NVIDIA_BASE_URL,
		apiKey: env.NVIDIA_API_KEY,
	},
	dimensions: 1024,
})

export const embedDocuments: EmbedFn = async (texts) => {
	const vectors: number[][] = []
	for (let offset = 0; offset < texts.length; offset += env.EMB_BATCH_SIZE) {
		vectors.push(...(await embeddings.embedDocuments(texts.slice(offset, offset + env.EMB_BATCH_SIZE))))
	}
	return vectors
}
