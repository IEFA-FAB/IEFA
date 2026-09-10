import { AIMessage } from "@langchain/core/messages"
import type { AgentState } from "../state.ts"

/**
 * Fim dos dois caminhos que NÃO podem ser respondidos em texto livre.
 *
 * Busca vazia deixou de terminar aqui: ela vai ao chat geral, que compõe a resposta com a
 * ressalva de procedência (`radaAgentCondition`). O que sobra são dois desfechos, e eles
 * dizem coisas diferentes ao usuário:
 *
 * - **rascunho não-ancorado** — o modelo afirmou o que os documentos não sustentam;
 * - **busca fora do ar** — a consulta ao corpus falhou, e responder de memória do modelo
 *   uma pergunta sobre o regulamento seria pior do que admitir a indisponibilidade.
 *
 * Havia um mapa com cinco textos, e quatro ficaram inalcançáveis quando os caminhos que os
 * traziam mudaram de destino — mensagem inalcançável não é rede de segurança, é o texto que
 * ninguém percebe estar errado. Ficaram os dois que se alcança.
 */
const UNVERIFIABLE_DRAFT = "Não foi possível gerar uma resposta verificável com base na legislação disponível."

const SEARCH_UNAVAILABLE =
	"A consulta ao RADA-e está indisponível no momento, e por isso não há como responder com base no regulamento. Tente novamente em alguns minutos."

export async function noBasisNode(state: AgentState): Promise<Partial<AgentState>> {
	// A alucinação tem precedência: um turno pode ter as duas marcas — rascunho não-ancorado
	// e, na volta seguinte, a busca fora do ar — e aí o que aconteceu de mais grave é o
	// modelo ter afirmado o que os documentos não sustentam. Dizer "tente em alguns minutos"
	// ali prometeria que a repetição resolve.
	const wasUngrounded = state.termination_reason === "hallucination_detected"
	const final_response = !wasUngrounded && state.retrieval_outcome === "unavailable" ? SEARCH_UNAVAILABLE : UNVERIFIABLE_DRAFT

	return {
		final_response,
		cited_documents: [],
		messages: [new AIMessage(final_response)],
	}
}
