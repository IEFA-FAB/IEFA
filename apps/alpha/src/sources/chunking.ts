/**
 * Chunking da árvore de seções para busca híbrida.
 *
 * Separado de `pipeline.ts` porque é lógica pura: o pipeline fala com o banco e
 * com o embedder, isto aqui só transforma nós em texto recuperável — e é o que
 * os testes exercitam contra os modelos reais da AGU.
 */

import { estimateTokens } from "../lib/text.ts"
import type { StructureNodeDraft } from "./types.ts"

/** Alvo de tamanho de chunk, alinhado à ingestão markdown já existente. */
export const MAX_CHUNK_TOKENS = 512

export interface ChunkDraft {
	content: string
	chapter: string | null
	article: string | null
	section: string | null
	chunk_index: number
}

/**
 * Um chunk por seção de nível 1, com as subseções agregadas.
 *
 * Seção grande demais é partida em pedaços de mesmo tamanho, com o título
 * repetido no início de cada um — sem o título, o pedaço 2 em diante perde o
 * contexto que o torna recuperável.
 */
export function buildChunks(nodes: StructureNodeDraft[]): ChunkDraft[] {
	const chunks: ChunkDraft[] = []
	let index = 0

	for (const node of nodes) {
		if (node.level !== 1) continue

		const descendants = nodes.filter((candidate) => candidate.path.startsWith(`${node.path}.`))
		const text = [node.title, node.body, ...descendants.map((child) => [child.title, child.body].filter(Boolean).join(" "))].filter(Boolean).join("\n").trim()

		if (!text) continue

		if (estimateTokens(text) <= MAX_CHUNK_TOKENS) {
			chunks.push({ content: text, chapter: node.title, article: null, section: null, chunk_index: index++ })
			continue
		}

		const size = MAX_CHUNK_TOKENS * 4
		for (let offset = 0; offset < text.length; offset += size) {
			const slice = text.slice(offset, offset + size)
			chunks.push({
				content: offset === 0 ? slice : `${node.title}\n${slice}`,
				chapter: node.title,
				article: null,
				section: null,
				chunk_index: index++,
			})
		}
	}

	return chunks
}
