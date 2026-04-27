import { AIMessage } from "@langchain/core/messages"
import { getLLM } from "../../lib/llm"
import type { AgentState } from "../state"

const SYSTEM_PROMPT = `Você é o ATLAS, assistente especializado em legislação aeronáutica.
Responda usando EXCLUSIVAMENTE os documentos fornecidos, usando o rascunho como base.
Inclua citações inline no formato [¹], [²], etc. conforme o rascunho já indica.
Ao final, liste as fontes no formato:
¹ FONTE — Capítulo, Artigo

NUNCA afirme algo além do que está nos documentos.`

export async function synthesizerNode(state: AgentState): Promise<Partial<AgentState>> {
	const { retrieved_documents, generated_response_draft, messages } = state

	const docsContext = retrieved_documents.map((d, i) => `[${i + 1}] ${d.content}`).join("\n\n")

	const userQuery =
		messages
			.filter((m) => m._getType() === "human")
			.pop()
			?.content?.toString() ?? ""

	const response = await getLLM(0.3).invoke([
		{ role: "system", content: SYSTEM_PROMPT },
		{
			role: "user",
			content: `DOCUMENTOS:\n${docsContext}\n\nRASCUNHO VERIFICADO:\n${generated_response_draft ?? ""}\n\nPERGUNTA ORIGINAL: ${userQuery}`,
		},
	])

	const final_response = response.content.toString()
	const cited_documents = retrieved_documents.map((d) => d.id)

	return {
		final_response,
		cited_documents,
		termination_reason: "success",
		messages: [new AIMessage(final_response)],
	}
}
