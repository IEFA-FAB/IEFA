import { AIMessage } from "@langchain/core/messages"
import type { AgentState, TerminationReason } from "../state.ts"

const FALLBACK_MESSAGES: Record<TerminationReason, string> = {
	// Mesma forma da ressalva do chat geral: quem pergunta ao ChatRADA precisa saber que a
	// informação não está no regulamento, e não receber um "não encontrei" ambíguo que
	// poderia ser lido como falha de busca.
	no_documents_found: "Essa informação não existe no RADA-e e não tenho certeza sobre ela.",
	low_relevance_score: "Essa informação não existe no RADA-e e não tenho certeza sobre ela.",
	hallucination_detected: "Não foi possível gerar uma resposta verificável com base na legislação disponível.",
	max_iterations_reached: "Após múltiplas tentativas de busca, não foi encontrado embasamento normativo suficiente para sua consulta.",
	max_retries_reached: "A resposta gerada não pôde ser verificada contra a legislação disponível. Por favor, reformule sua consulta.",
	success: "",
}

export async function noBasisNode(state: AgentState): Promise<Partial<AgentState>> {
	const reason = state.termination_reason ?? "no_documents_found"
	const final_response = FALLBACK_MESSAGES[reason] || "Não foi possível processar sua consulta no momento."

	return {
		final_response,
		cited_documents: [],
		messages: [new AIMessage(final_response)],
	}
}
