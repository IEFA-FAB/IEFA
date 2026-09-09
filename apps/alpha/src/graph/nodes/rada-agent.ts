import { AERONAUTICAL_DOCUMENT_TYPES } from "../../lib/corpora"
import { getLLM } from "../../lib/llm"
import type { RADARetrieverOutput } from "../../tools/rada-retriever"
import { radaRetriever } from "../../tools/rada-retriever"
import type { AgentState } from "../state"

const REFORMULATION_PROMPT = (query: string) =>
	`Você é especialista em legislação aeronáutica brasileira (RADA, RBHA, ICA).
A query "${query}" não retornou documentos relevantes.

Reformule para melhorar o recall:
- Use terminologia técnica aeronáutica (ex: "piloto" → "comandante")
- Considere artigos ou capítulos relacionados
- Não invente termos que não existem na legislação

Retorne APENAS a query reformulada.`

/**
 * O ChatRADA responde sobre legislação aeronáutica, e `alpha.document` também
 * guarda a Lei 14.133 e os modelos da AGU. Sem este filtro a pergunta sobre o
 * RADA volta com trecho de norma de contratação — e o usuário não tem como
 * perceber, porque a interface lista a fonte pelo id do chunk.
 */
export const RADA_CORPUS_FILTER = { document_type: AERONAUTICAL_DOCUMENT_TYPES } as const

export async function radaAgentNode(state: AgentState): Promise<Partial<AgentState>> {
	const iterations = state.retrieval_iterations
	const query = iterations === 0 ? state.original_query : (state.reformulated_query ?? state.original_query)

	let result: RADARetrieverOutput
	try {
		result = await radaRetriever({ query, filters: RADA_CORPUS_FILTER })
	} catch {
		return {
			has_sufficient_context: false,
			retrieval_iterations: iterations + 1,
			termination_reason: "no_documents_found",
		}
	}

	const newIterations = iterations + 1

	if (result.after_threshold >= 1) {
		return {
			retrieved_documents: result.documents,
			has_sufficient_context: true,
			retrieval_iterations: newIterations,
		}
	}

	const reformulationResponse = await getLLM(0).invoke([{ role: "user", content: REFORMULATION_PROMPT(query) }])
	const reformulated_query = reformulationResponse.content.toString().trim()

	return {
		retrieved_documents: [],
		has_sufficient_context: false,
		retrieval_iterations: newIterations,
		reformulated_query,
	}
}
