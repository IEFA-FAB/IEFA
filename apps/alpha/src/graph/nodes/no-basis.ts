import { AIMessage } from "@langchain/core/messages"
import type { AgentState } from "../state.ts"

/**
 * Fim do caminho da ALUCINAÇÃO, e só dele.
 *
 * Busca vazia deixou de terminar aqui: ela vai ao chat geral, que compõe a resposta com a
 * ressalva de procedência (`radaAgentCondition`). O que sobra para este nó é o rascunho que
 * afirmou sem base — pelo `graderCondition`, quando as retentativas de ancoragem se
 * esgotam, ou pelo laço de ancoragem que esgotou a recuperação.
 *
 * Por isso a mensagem é UMA. Havia um mapa por `termination_reason` com cinco textos, e
 * quatro deles ficaram inalcançáveis quando os caminhos que os traziam mudaram de destino —
 * mensagem inalcançável não é rede de segurança, é o texto que ninguém percebe estar errado.
 * Um motivo diferente chegando aqui é um caminho novo no grafo, e a frase continua honesta:
 * ela declara que não foi possível VERIFICAR a resposta, sem prometer por que.
 */
const UNVERIFIABLE_DRAFT = "Não foi possível gerar uma resposta verificável com base na legislação disponível."

export async function noBasisNode(_state: AgentState): Promise<Partial<AgentState>> {
	return {
		final_response: UNVERIFIABLE_DRAFT,
		cited_documents: [],
		messages: [new AIMessage(UNVERIFIABLE_DRAFT)],
	}
}
