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

/** Iterações de recuperação antes de desistir do corpus. */
export const MAX_RETRIEVAL_ITERATIONS = 3

/**
 * Esgotar a busca manda ao chat geral — salvo se o turno já alucinou.
 *
 * O `no_basis` responde uma frase fixa ("não existe no RADA-e e não tenho certeza"). Com o
 * roteador consultando o corpus por padrão, terminar ali seria uma REGRESSÃO para a
 * pergunta genérica: ela deixaria de receber a resposta com fonte nomeada que o chat geral
 * compõe. O chat geral não é caminho livre — `composeNonRadaAnswer` exige fonte nomeada e,
 * sem ela, devolve a MESMA frase do `no_basis`. O piso é o mesmo; o teto, maior.
 *
 * A exceção é o turno que chegou aqui pelo laço do grader com rascunho não-ancorado: esse
 * termina no `no_basis`, porque uma alucinação já detectada não pode ser respondida em
 * texto livre. O `graderCondition` é o outro caminho para lá.
 */
export function radaAgentCondition(state: AgentState): string {
	if (state.has_sufficient_context) return "grader"
	if (state.retrieval_halted || state.retrieval_iterations >= MAX_RETRIEVAL_ITERATIONS) {
		// Turno que já produziu rascunho não-ancorado NÃO ganha o chat geral: ele veio parar
		// aqui pelo laço do grader, e responder em texto livre depois de uma alucinação
		// detectada é exatamente o que o `no_basis` existe para impedir. Mesmo predicado que
		// o `radaAgentNode` usa para reconhecer a retentativa de ancoragem.
		const cameFromHallucination = state.grading_retries > 0 && state.grounding_check?.is_grounded === false
		// Busca FORA DO AR também não: o chat geral responderia de memória do modelo uma
		// pergunta sobre o regulamento, e o usuário leria isso como resposta normal. Corpus
		// consultado e vazio é outra coisa — aí o chat geral responde, com a ressalva.
		const searchWasBroken = state.retrieval_outcome === "unavailable"
		return cameFromHallucination || searchWasBroken ? "no_basis" : "general_chat"
	}
	return "rada_agent"
}

/**
 * Rascunho ancorado segue para o sintetizador; rascunho com afirmação sem base
 * volta a recuperar, e só depois de esgotar as tentativas responde "sem base".
 *
 * O ramo de retentativa era `"synthesizer"`, o mesmo do caminho ancorado: o
 * grader marcava a alucinação e a resposta seguia igual, com o alvo
 * `rada_agent` declarado no grafo e inalcançável. O laço é limitado por
 * `grading_retries` aqui e por `retrieval_iterations` no `radaAgentCondition`.
 */
export function graderCondition(state: AgentState): string {
	const { grounding_check, grading_retries } = state
	if (grounding_check?.is_grounded) return "synthesizer"
	if (grading_retries >= 2) return "no_basis"
	return "rada_agent"
}
