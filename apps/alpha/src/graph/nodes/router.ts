import { invokeStructured } from "../../lib/llm"
import type { AgentState, Intent } from "../state"

const routerSchema = {
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
}

const SYSTEM_PROMPT = `Você é um classificador de intenção para o sistema ATLAS da SEFA (Secretaria de Economia, Finanças e Administração da Aeronáutica).

Classifique a mensagem do usuário em uma das categorias:
- LEGISLATION: questões sobre RADA, RBHA, ICA, MCA, NSCA, legislação aeronáutica, regulamentos, artigos, capítulos
- SEFA_SYSTEMS: sistemas internos da SEFA, módulos, processos de administração financeira e orçamentária
- PROCUREMENT: licitações, contratos, pregões, compras públicas
- GENERAL: perguntas genéricas, não classificadas nos acima
- GREETING: saudações, cumprimentos, despedidas
- UNKNOWN: impossível classificar

Retorne APENAS o JSON com o campo "intent".`

export async function routerNode(state: AgentState): Promise<Partial<AgentState>> {
	const lastMessage = state.messages[state.messages.length - 1]
	const query = lastMessage?.content?.toString() ?? ""

	try {
		const result = await invokeStructured<{ intent: Intent }>(routerSchema, [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: query },
		])

		const intent = result.intent ?? "UNKNOWN"
		return { intent, original_query: query }
	} catch (error) {
		// `UNKNOWN` roteia para o chat geral, que responde SEM consultar o corpus. Um
		// classificador que falha sempre — porque o modelo configurado não emite tool call,
		// por exemplo — transforma o ChatRADA num chat comum, e em silêncio: toda pergunta
		// era respondida de memória do modelo, sem nenhum sinal de erro. O aviso é o que
		// distingue "não soube classificar" de "o classificador está quebrado".
		console.warn(`[router] classificação falhou, caindo em UNKNOWN: ${error instanceof Error ? error.message : String(error)}`)
		return { intent: "UNKNOWN", original_query: query }
	}
}
