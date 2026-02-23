import { AIMessage } from "@langchain/core/messages"
import { getLLM } from "../../lib/llm"
import type { AgentState } from "../state"

const SYSTEM_PROMPT = `Você é o ATLAS, assistente virtual da SEFA (Secretaria da Fazenda do Estado do Pará).
Responda de forma prestativa e profissional. Para perguntas gerais e saudações, responda diretamente sem consultar documentos legislativos.`

export async function generalChatNode(state: AgentState): Promise<Partial<AgentState>> {
	const response = await getLLM(0.7).invoke([
		{ role: "system", content: SYSTEM_PROMPT },
		...state.messages,
	])

	const final_response = response.content.toString()

	return {
		final_response,
		cited_documents: [],
		termination_reason: "success",
		messages: [new AIMessage(final_response)],
	}
}
