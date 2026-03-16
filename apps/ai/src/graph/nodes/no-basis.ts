import { AIMessage } from "@langchain/core/messages"
import type { AgentState, TerminationReason } from "../state.ts"

const FALLBACK_MESSAGES: Record<TerminationReason, string> = {
	no_documents_found: "Não foi encontrada base normativa na legislação disponível para responder sua consulta.",
	low_relevance_score: "Os documentos encontrados não possuem relevância suficiente para embasar uma resposta segura.",
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
