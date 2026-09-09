import type { AgentState } from "../state.ts"

export function routerCondition(state: AgentState): string {
	switch (state.intent) {
		case "LEGISLATION":
			return "rada_agent"
		case "SEFA_SYSTEMS":
			return "general_chat" // Etapa 2
		case "PROCUREMENT":
			return "general_chat" // Etapa 3
		default:
			return "general_chat"
	}
}

export function radaAgentCondition(state: AgentState): string {
	if (state.has_sufficient_context) return "grader"
	if (state.retrieval_iterations >= 3) return "no_basis"
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
