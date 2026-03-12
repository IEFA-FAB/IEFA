import { OpenAIEmbeddings } from "@langchain/openai"
import { ENV } from "varlock/env"
import { supabase } from "../db/supabase.ts"
import type { DocumentType, RetrievedDocument } from "../graph/state.ts"

export interface RADARetrieverInput {
	query: string
	filters?: {
		document_type?: DocumentType
		year_from?: number
		year_to?: number
		chapter?: string
		article?: string
	}
	top_k?: number
}

export interface RADARetrieverOutput {
	documents: RetrievedDocument[]
	total_found: number
	after_threshold: number
	search_metadata: {
		semantic_count: number
		keyword_count: number
		fusion_method: "RRF"
		threshold_applied: number
		query_used: string
	}
}

const embeddings = new OpenAIEmbeddings({
	model: ENV.EMB_MODEL,
	configuration: {
		baseURL: ENV.NVIDIA_BASE_URL,
		apiKey: ENV.NVIDIA_API_KEY,
	},
	dimensions: 1024,
})

const THRESHOLD = ENV.RERANK_THRESHOLD
const RRF_K = ENV.RRF_K
const RERANK_TOP_N = ENV.RERANK_TOP_N

async function semanticSearch(
	queryVector: number[],
	filters: RADARetrieverInput["filters"],
	topK: number
) {
	const vectorStr = `[${queryVector.join(",")}]`
	let query = supabase.rpc("match_chunks_cosine", {
		query_embedding: vectorStr,
		match_count: topK,
	})

	if (filters?.document_type) {
		query = query.eq("document_type", filters.document_type)
	}
	if (filters?.chapter) query = query.eq("chapter", filters.chapter)
	if (filters?.article) query = query.eq("article", filters.article)

	const { data, error } = await query
	if (error) throw new Error(`Semantic search failed: ${error.message}`)
	return (data ?? []) as Array<{
		id: string
		content: string
		chapter: string
		article: string
		section: string
		document_type: string
		source: string
		year: number
		similarity: number
	}>
}

async function keywordSearch(
	queryText: string,
	filters: RADARetrieverInput["filters"],
	topK: number
) {
	let query = supabase.rpc("match_chunks_fts", {
		query_text: queryText,
		match_count: topK,
	})

	if (filters?.document_type) query = query.eq("document_type", filters.document_type)
	if (filters?.chapter) query = query.eq("chapter", filters.chapter)
	if (filters?.article) query = query.eq("article", filters.article)

	const { data, error } = await query
	if (error) throw new Error(`Keyword search failed: ${error.message}`)
	return (data ?? []) as Array<{
		id: string
		content: string
		chapter: string
		article: string
		section: string
		document_type: string
		source: string
		year: number
		rank: number
	}>
}

function rrfFusion(
	semanticResults: Array<{ id: string; [k: string]: any }>,
	keywordResults: Array<{ id: string; [k: string]: any }>
): Map<string, { doc: any; rrf_score: number }> {
	const scores = new Map<string, { doc: any; rrf_score: number }>()

	semanticResults.forEach((doc, rank) => {
		const score = 1 / (RRF_K + rank + 1)
		scores.set(doc.id, { doc, rrf_score: score })
	})

	keywordResults.forEach((doc, rank) => {
		const score = 1 / (RRF_K + rank + 1)
		const existing = scores.get(doc.id)
		if (existing) {
			existing.rrf_score += score
		} else {
			scores.set(doc.id, { doc, rrf_score: score })
		}
	})

	return scores
}

async function rerank(
	query: string,
	docs: Array<{ id: string; content: string; [k: string]: any }>
): Promise<Array<{ id: string; score: number }>> {
	const model = ENV.NVIDIA_RERANK_MODEL
	const baseUrl = ENV.NVIDIA_BASE_URL
	const apiKey = ENV.NVIDIA_API_KEY

	const response = await fetch(`${baseUrl}/ranking`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model,
			query: { text: query },
			passages: docs.map((d) => ({ text: d.content })),
			truncate: "END",
		}),
	})

	if (!response.ok) {
		throw new Error(`Reranker failed: ${response.status} ${await response.text()}`)
	}

	const result = (await response.json()) as { rankings: Array<{ index: number; logit: number }> }
	return result.rankings.map((r) => ({
		id: docs[r.index].id,
		score: 1 / (1 + Math.exp(-r.logit)),
	}))
}

export async function radaRetriever(input: RADARetrieverInput): Promise<RADARetrieverOutput> {
	const { query, filters, top_k = 10 } = input
	const queryWithPrefix = `${ENV.EMB_QUERY_PREFIX}${query}`

	const queryVector = await embeddings.embedQuery(queryWithPrefix)

	const [semDocs, keywordDocs] = await Promise.all([
		semanticSearch(queryVector, filters, top_k),
		keywordSearch(query, filters, top_k),
	])

	const fused = rrfFusion(semDocs, keywordDocs)
	const fusedArray = [...fused.values()]
		.sort((a, b) => b.rrf_score - a.rrf_score)
		.slice(0, RERANK_TOP_N)

	const total_found = fusedArray.length

	if (total_found === 0) {
		return {
			documents: [],
			total_found: 0,
			after_threshold: 0,
			search_metadata: {
				semantic_count: semDocs.length,
				keyword_count: keywordDocs.length,
				fusion_method: "RRF",
				threshold_applied: THRESHOLD,
				query_used: query,
			},
		}
	}

	const rerankResults = await rerank(
		query,
		fusedArray.map((f) => f.doc)
	)

	const rerankMap = new Map(rerankResults.map((r) => [r.id, r.score]))

	const documents: RetrievedDocument[] = fusedArray
		.map((f) => {
			const rerank_score = rerankMap.get(f.doc.id) ?? 0
			const semResult = semDocs.find((s) => s.id === f.doc.id)
			const kwResult = keywordDocs.find((k) => k.id === f.doc.id)

			return {
				id: f.doc.id,
				content: f.doc.content,
				metadata: {
					source: f.doc.source ?? "",
					document_type: (f.doc.document_type ?? "RADA") as DocumentType,
					chapter: f.doc.chapter ?? "",
					article: f.doc.article ?? "",
					section: f.doc.section,
					year: f.doc.year ?? 0,
					page: 0,
				},
				scores: {
					semantic_score: semResult?.similarity ?? 0,
					keyword_score: kwResult ? 1 / (RRF_K + keywordDocs.indexOf(kwResult) + 1) : 0,
					rerank_score,
				},
			} satisfies RetrievedDocument
		})
		.filter((d) => d.scores.rerank_score >= THRESHOLD)
		.sort((a, b) => b.scores.rerank_score - a.scores.rerank_score)

	return {
		documents,
		total_found,
		after_threshold: documents.length,
		search_metadata: {
			semantic_count: semDocs.length,
			keyword_count: keywordDocs.length,
			fusion_method: "RRF",
			threshold_applied: THRESHOLD,
			query_used: query,
		},
	}
}
