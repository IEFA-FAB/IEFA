import { HumanMessage } from "@langchain/core/messages"

/**
 * Entrada de UM turno, com o estado de trabalho zerado.
 *
 * O grafo roda sobre o checkpointer do LangGraph, com `thread_id = session_id`: os canais
 * SOBREVIVEM entre perguntas da mesma conversa. Só `messages` deveria — é o histórico. O
 * resto é contabilidade de um turno, e carregá-la adiante quebra o laço de recuperação:
 * `retrieval_iterations` chegava na terceira pergunta da sessão já em 3, e a partir dali
 * toda pergunta tinha UMA tentativa de busca, sem nenhuma reformulação, antes de desistir
 * do corpus. Quanto mais longa a conversa, menos o ChatRADA consultava o RADA-e.
 *
 * Só valor DEFINIDO reseta: o LangGraph ignora chave com `undefined` no input (canal
 * mantém o valor anterior), e é por isso que o resultado da busca é um canal próprio
 * (`retrieval_outcome`, que aceita `null`) em vez de um `termination_reason: undefined`.
 * `reformulated_query` é `string | null` pelo mesmo motivo — o `query_log` o lê em TODO
 * turno, então "não resetar" ali significa registrar a reformulação da pergunta anterior.
 * `grounding_check` e `generated_response_draft` seguem a limitação do `undefined`; quem os
 * protege é `grading_retries: 0`, que fecha os ramos que os leem antes de o grader reescrevê-los.
 */
export function buildTurnInput(message: string, session_id: string, user_id: string) {
	return {
		messages: [new HumanMessage(message)],
		session_id,
		user_id,
		retrieval_iterations: 0,
		grading_retries: 0,
		retrieval_outcome: null,
		retrieval_halted: false,
		reformulated_query: null,
		has_sufficient_context: false,
		retrieved_documents: [],
		cited_documents: [],
	}
}
