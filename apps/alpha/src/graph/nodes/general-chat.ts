import { AIMessage } from "@langchain/core/messages"
import { invokeText } from "../../lib/llm"
import type { AgentState } from "../state"

const SYSTEM_PROMPT = `Você é o ATLAS, assistente virtual da SEFA (Secretaria de Economia, Finanças e Administração da Aeronáutica).
Responda de forma prestativa e profissional. Para perguntas gerais e saudações, responda diretamente sem consultar documentos legislativos.`

export async function generalChatNode(state: AgentState): Promise<Partial<AgentState>> {
	const final_response = await invokeText([{ role: "system", content: SYSTEM_PROMPT }, ...state.messages], 0.7)

	return {
		final_response,
		cited_documents: [],
		termination_reason: "success",
		messages: [new AIMessage(final_response)],
	}
}
