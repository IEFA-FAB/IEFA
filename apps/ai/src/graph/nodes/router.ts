import { getLLM } from "../../lib/llm"
import type { AgentState, Intent } from "../state"

const classifier = getLLM(0).withStructuredOutput({
	name: "classify_intent",
	description: "Classifies user intent",
	parameters: {
		type: "object",
		properties: {
			intent: {
				type: "string",
				enum: ["LEGISLATION", "SEFA_SYSTEMS", "PROCUREMENT", "GENERAL", "GREETING", "UNKNOWN"],
			},
		},
		required: ["intent"],
	},
})

const SYSTEM_PROMPT = `Você é um classificador de intenção para o sistema ATLAS da SEFA (Secretaria da Fazenda do Estado do Pará).

Classifique a mensagem do usuário em uma das categorias:
- LEGISLATION: questões sobre RADA, RBHA, ICA, MCA, NSCA, legislação aeronáutica, regulamentos, artigos, capítulos
- SEFA_SYSTEMS: sistemas internos SEFA, módulos, processos de gestão fiscal
- PROCUREMENT: licitações, contratos, pregões, compras públicas
- GENERAL: perguntas genéricas, não classificadas nos acima
- GREETING: saudações, cumprimentos, despedidas
- UNKNOWN: impossível classificar

Retorne APENAS o JSON com o campo "intent".`

export async function routerNode(state: AgentState): Promise<Partial<AgentState>> {
	const lastMessage = state.messages[state.messages.length - 1]
	const query = lastMessage?.content?.toString() ?? ""

	try {
		const result = await classifier.invoke([
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: query },
		])

		const intent = (result as { intent: Intent }).intent ?? "UNKNOWN"
		return { intent, original_query: query }
	} catch {
		return { intent: "UNKNOWN", original_query: query }
	}
}
