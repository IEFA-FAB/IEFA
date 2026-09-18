import { AIMessage } from "@langchain/core/messages"
import type { AgentState } from "../state"

/** Marcador de citação como os prompts o escrevem: `[¹]`, `[²]`… */
const SUPERSCRIPTS = ["¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"]

/**
 * A lista de fontes, montada em código.
 *
 * Fora o estilo, é a única coisa que o sintetizador acrescenta ao rascunho — e sai inteira
 * dos metadados, sem nada para o modelo decidir.
 */
function formatSources(documents: AgentState["retrieved_documents"]): string {
	const lines = documents.slice(0, SUPERSCRIPTS.length).map((d, i) => {
		const device = [d.metadata.chapter, d.metadata.section, d.metadata.article].filter(Boolean).join(", ")
		return `- ${SUPERSCRIPTS[i]} ${d.metadata.source}${device ? ` — ${device}` : ""}`
	})
	return lines.length > 0 ? `\n\n**Referências**\n\n${lines.join("\n")}` : ""
}

/**
 * A resposta do turno que precisou de revisão — sem mais uma geração.
 *
 * Esse turno já gastou quatro chamadas de modelo no grader (rascunho, juiz, revisão, juiz).
 * O turno medido que terminava em `no_basis` levou 44 s, e o SSE corta em 60 s
 * (`routes.ts`): pedir ao sintetizador uma terceira geração estouraria o corte e o usuário
 * perderia uma resposta que já existe e já passou pelo juiz. O rascunho revisado É a
 * resposta; o que faltava nele era a lista de fontes, que não precisa de modelo.
 *
 * `null` quando o turno passou de primeira: aí a geração extra cabe com folga, e quem
 * responde é o sintetizador.
 */
export function buildVerifiedAnswer(state: AgentState): Partial<AgentState> | null {
	if (state.grading_retries === 0 || !state.generated_response_draft) return null

	const final_response = state.generated_response_draft + formatSources(state.retrieved_documents)

	return {
		final_response,
		cited_documents: state.retrieved_documents.map((d) => d.id),
		termination_reason: "success",
		messages: [new AIMessage(final_response)],
	}
}
