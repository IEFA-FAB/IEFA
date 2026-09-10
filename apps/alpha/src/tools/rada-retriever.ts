import { supabase } from "../db/supabase.ts"
import { env } from "../env.ts"
import type { RetrievedDocument } from "../graph/state.ts"
import type { DocumentType } from "../lib/corpora.ts"
import { toDocumentType } from "../lib/corpora.ts"
import { embeddingError, embeddingModelId, getEmbeddings } from "../lib/embeddings.ts"

export interface RADARetrieverInput {
	query: string
	filters: {
		/**
		 * Corpus a consultar, e é OBRIGATÓRIO: `alpha.document` guarda a legislação
		 * aeronáutica e a federal juntas, então omitir o filtro faz a busca atravessar os
		 * dois. Era opcional — e "opcional" significava exatamente o bug que este campo
		 * existe para impedir, porque o guard estático só vê quem escreveu `document_type`,
		 * não quem esqueceu. Agora a omissão é erro de compilação. Aceita conjunto porque um
		 * corpus é mais de um tipo (`AERONAUTICAL_DOCUMENT_TYPES`, `FEDERAL_LEGISLATION_TYPES`).
		 */
		document_type: DocumentType | readonly DocumentType[]
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
		/** Corpus efetivamente consultado. */
		document_types_filtered: readonly DocumentType[]
		/**
		 * `false` = o limiar foi aplicado sobre a ordenação posicional do RRF, não
		 * sobre score de relevância. Sem isso a degradação do rerank passa batida.
		 */
		rerank_applied: boolean
	}
}

const THRESHOLD = env.RERANK_THRESHOLD
const RRF_K = env.RRF_K
const RERANK_TOP_N = env.RERANK_TOP_N

// As RPCs `alpha.match_chunks_cosine` / `alpha.match_chunks_fts` já restringem o
// resultado à versão vigente (`document_chunk.is_current`, espelho de
// `document.superseded_at is null`). Versões superseded seguem legíveis por ID,
// para auditoria de pareceres antigos, mas nunca entram na busca.
/** Um tipo ou um conjunto viram sempre array, que é o que a RPC recebe. */
function asTypeArray(documentType: DocumentType | readonly DocumentType[]): string[] {
	return Array.isArray(documentType) ? [...documentType] : [documentType as DocumentType]
}

async function semanticSearch(queryVector: number[], filters: RADARetrieverInput["filters"], topK: number) {
	const vectorStr = `[${queryVector.join(",")}]`
	// `embedding_model` evita o pior silêncio possível: comparar um vetor do
	// modelo atual com vetores gerados por outro modelo devolve distâncias sem
	// significado, e a busca "funciona" retornando lixo.
	// `document_types` vai DENTRO da RPC: ela ordena e corta com `limit match_count`, e o
	// `set search_path = ''` impede inlining, então um filtro por fora podaria o top-N
	// GLOBAL em vez de escopar a ordenação.
	let query = supabase.rpc("match_chunks_cosine", {
		query_embedding: vectorStr,
		match_count: topK,
		embedding_model_filter: embeddingModelId(),
		document_types: asTypeArray(filters.document_type),
	})
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

async function keywordSearch(queryText: string, filters: RADARetrieverInput["filters"], topK: number) {
	let query = supabase.rpc("match_chunks_fts", {
		query_text: queryText,
		match_count: topK,
		document_types: asTypeArray(filters.document_type),
	})
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

/**
 * Rerank no Bedrock, pela API de Rerank do `bedrock-agent-runtime`.
 *
 * Import dinâmico para não puxar o SDK da AWS quando o rerank está desligado —
 * mesmo cuidado que o adapter bedrock do `@iefa/ai-provider` já toma.
 */
async function rerankBedrock(query: string, docs: Array<{ id: string; content: string }>): Promise<Array<{ id: string; score: number }>> {
	const { BedrockAgentRuntimeClient, RerankCommand } = await import("@aws-sdk/client-bedrock-agent-runtime")
	const client = new BedrockAgentRuntimeClient({ region: env.ALPHA_AI_REGION })

	const response = await client.send(
		new RerankCommand({
			queries: [{ type: "TEXT", textQuery: { text: query } }],
			sources: docs.map((doc) => ({ type: "INLINE", inlineDocumentSource: { type: "TEXT", textDocument: { text: doc.content } } })),
			rerankingConfiguration: {
				type: "BEDROCK_RERANKING_MODEL",
				bedrockRerankingConfiguration: {
					modelConfiguration: { modelArn: `arn:aws:bedrock:${env.ALPHA_AI_REGION}::foundation-model/${env.ALPHA_RERANK_MODEL}` },
					numberOfResults: docs.length,
				},
			},
		})
	)

	return (response.results ?? []).map((result) => ({ id: docs[result.index ?? 0].id, score: result.relevanceScore ?? 0 }))
}

async function rerankNvidia(query: string, docs: Array<{ id: string; content: string; [k: string]: any }>): Promise<Array<{ id: string; score: number }>> {
	const model = env.NVIDIA_RERANK_MODEL
	const baseUrl = env.NVIDIA_BASE_URL
	const apiKey = env.NVIDIA_API_KEY

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

interface RerankOutcome {
	scores: Array<{ id: string; score: number }>
	/** `false` quando caiu na ordenação posicional do RRF. */
	applied: boolean
}

async function rerankOrFallback(query: string, docs: Array<{ id: string; content: string; [k: string]: any }>): Promise<RerankOutcome> {
	// O piso em THRESHOLD é deliberado: sem rerank não existe score de
	// relevância, e deixar o limiar cortar uma ordenação meramente posicional
	// descartaria documento bom por posição. O preço é que o limiar não filtra
	// nada nesse modo — por isso `applied: false` sai no `search_metadata`, e a
	// defesa contra resposta sem base passa a ser o grader.
	const posicional = (): RerankOutcome => ({
		scores: docs.map((doc, index) => ({ id: doc.id, score: Math.max(THRESHOLD, 1 - index / Math.max(docs.length, 1)) })),
		applied: false,
	})

	if (!env.ALPHA_RERANK_MODEL) return posicional()

	try {
		const scores = env.ALPHA_AI_PROVIDER === "bedrock" ? await rerankBedrock(query, docs) : await rerankNvidia(query, docs)
		return { scores, applied: true }
	} catch (error) {
		// Rerank é melhoria de ordenação, não requisito de correção: sua queda
		// degrada o resultado, não pode derrubar a recuperação inteira.
		console.warn("[retriever] rerank indisponível, usando ordenação do RRF:", error instanceof Error ? error.message : error)
		return posicional()
	}
}

export async function radaRetriever(input: RADARetrieverInput): Promise<RADARetrieverOutput> {
	const { query, filters, top_k = 10 } = input
	const queryWithPrefix = `${env.EMB_QUERY_PREFIX}${query}`
	const document_types_filtered: readonly DocumentType[] = Array.isArray(filters.document_type) ? [...filters.document_type] : [filters.document_type]
	if (document_types_filtered.length === 0) {
		throw new Error("radaRetriever: `filters.document_type` vazio — conjunto vazio não filtra nada, apenas deixa de casar com tudo")
	}

	// Busca semântica é opcional: sem provedor de embedding, a híbrida degrada
	// para keyword-only em vez de falhar. O `search_metadata` reporta zero
	// resultados semânticos, então a degradação aparece em vez de passar batida.
	const semanticPromise = env.ALPHA_EMBEDDINGS_ENABLED
		? getEmbeddings()
				.embedQuery(queryWithPrefix)
				.then((vector) => semanticSearch(vector, filters, top_k))
				.catch((error) => {
					// Recuperação não pode cair porque o embedder caiu: a perna de
					// full-text segue valendo e o erro fica registrado com contexto.
					console.warn(embeddingError(error).message)
					return [] as Awaited<ReturnType<typeof semanticSearch>>
				})
		: Promise.resolve([])

	const [semDocs, keywordDocs] = await Promise.all([semanticPromise, keywordSearch(query, filters, top_k)])

	const fused = rrfFusion(semDocs, keywordDocs)
	const fusedArray = [...fused.values()].sort((a, b) => b.rrf_score - a.rrf_score).slice(0, RERANK_TOP_N)

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
				document_types_filtered,
				rerank_applied: false,
			},
		}
	}

	// Sem modelo de rerank configurado, o score do RRF normalizado assume o
	// lugar — ordenação pior, não ausência de resultado.
	const rerank = await rerankOrFallback(
		query,
		fusedArray.map((f) => f.doc)
	)

	const rerankMap = new Map(rerank.scores.map((r) => [r.id, r.score]))

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
					document_type: toDocumentType(f.doc.document_type),
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
			document_types_filtered,
			rerank_applied: rerank.applied,
		},
	}
}
