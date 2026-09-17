import type { AgentState } from "../state.ts"

/**
 * Quem consulta o corpus e quem não consulta.
 *
 * A regra é **consultar por padrão**: só sai do corpus a mensagem que comprovadamente não
 * tem o que buscar nele. Era o contrário — `LEGISLATION` ia ao corpus e os outros CINCO
 * rótulos caíam no chat geral, que responde de memória do modelo. Como o classificador
 * decide antes de qualquer busca, um rótulo errado não era degradação de ordenação: era a
 * pergunta nunca chegando ao RADA-e. "O que é um TTAC?" — sigla definida no Manual F,
 * subitem 4.2.13 — não achava nada, e "o que é Termo de Transmissão e Assunção de Cargo?"
 * achava, porque a segunda redação parece norma e a primeira parece sigla de sistema.
 *
 * `GENERAL` e `UNKNOWN` são exatamente a dúvida do classificador, e dúvida agora custa uma
 * busca, não uma resposta sem lastro. O preço é limitado: sem documento acima do limiar, o
 * `radaAgentCondition` esgota em 3 iterações e devolve o caminho ao chat geral, com a
 * ressalva de procedência que ele já compõe.
 */
export function routerCondition(state: AgentState): string {
	switch (state.intent) {
		// Cumprimentar não tem o que buscar: não há dispositivo do RADA-e que responda "bom dia".
		case "GREETING":
			return "general_chat"
		// Contratação pública NÃO é o corpus deste chat. `RADA_CORPUS_FILTER` escopa a busca à
		// legislação aeronáutica, e a Lei 14.133 mora na mesma tabela sob outro `document_type`:
		// mandar a pergunta ao corpus aqui gastaria três iterações para chegar ao mesmo lugar.
		// Quem responde sobre contratação é o verificador de conformidade, que tem corpus próprio.
		case "PROCUREMENT":
			return "general_chat"
		// LEGISLATION, SEFA_SYSTEMS, GENERAL, UNKNOWN. `SEFA_SYSTEMS` estava do lado errado desde
		// sempre: o RADA-e É o Regulamento de Administração da Aeronáutica — agente da
		// administração, patrimônio, transmissão de cargo, unidade gestora estão nele.
		default:
			return "rada_agent"
	}
}

/** Iterações de recuperação antes de desistir do corpus, quando a pergunta é do domínio. */
export const MAX_RETRIEVAL_ITERATIONS = 3

/**
 * Orçamento de busca da pergunta que caiu no corpus por DÚVIDA do classificador.
 *
 * `GENERAL`/`UNKNOWN` chegam à recuperação porque na dúvida se consulta — mas se o RADA-e
 * não respondeu de primeira, reformular "qual a capital da França" com vocabulário
 * normativo não vai fazer aparecer. Cada rodada extra custa uma chamada de modelo e uma
 * busca híbrida, e o SSE corta em 60 s (`routes.ts`): a dúvida paga UMA busca, e a pergunta
 * do domínio paga as três.
 */
export const UNCERTAIN_RETRIEVAL_ITERATIONS = 1

export function retrievalBudget(intent: AgentState["intent"]): number {
	return intent === "GENERAL" || intent === "UNKNOWN" ? UNCERTAIN_RETRIEVAL_ITERATIONS : MAX_RETRIEVAL_ITERATIONS
}

/**
 * Esgotar a busca manda ao chat geral — salvo se a busca estava fora do ar.
 *
 * O `no_basis` responde uma frase fixa ("não existe no RADA-e e não tenho certeza"). Com o
 * roteador consultando o corpus por padrão, terminar ali seria uma REGRESSÃO para a
 * pergunta genérica: ela deixaria de receber a resposta com fonte nomeada que o chat geral
 * compõe. O chat geral não é caminho livre — `composeNonRadaAnswer` exige fonte nomeada e,
 * sem ela, devolve a MESMA frase do `no_basis`. O piso é o mesmo; o teto, maior.
 *
 * Não há mais volta do grader por aqui: rascunho reprovado é revisado dentro do próprio
 * grader (`gradeDraft`), então este nó só vê turno que ainda não gerou rascunho.
 */
export function radaAgentCondition(state: AgentState): string {
	if (state.has_sufficient_context) return "grader"
	if (state.retrieval_halted || state.retrieval_iterations >= retrievalBudget(state.intent)) {
		// Busca FORA DO AR não vai ao chat geral: ele responderia de memória do modelo uma
		// pergunta sobre o regulamento, e o usuário leria isso como resposta normal. Corpus
		// consultado e vazio é outra coisa — aí o chat geral responde, com a ressalva.
		return state.retrieval_outcome === "unavailable" ? "no_basis" : "general_chat"
	}
	return "rada_agent"
}

/**
 * Rascunho ancorado segue para o sintetizador; reprovado, termina no `no_basis`.
 *
 * O grader já gastou a segunda chance antes de chegar aqui — revisou o rascunho contra os
 * mesmos documentos e verificou de novo. Voltar à recuperação era o laço antigo, e ele
 * trocava trechos que respondiam a pergunta por outros, com extrapolação nova.
 */
export function graderCondition(state: AgentState): string {
	return state.grounding_check?.is_grounded ? "synthesizer" : "no_basis"
}
