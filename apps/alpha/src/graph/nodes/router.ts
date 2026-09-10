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

O corpus consultável é o RADA-e — o Regulamento de Administração da Aeronáutica — e as normas
aeronáuticas correlatas (RBHA, ICA, MCA, NSCA). O RADA-e trata da ADMINISTRAÇÃO da Força:
agentes da administração, transmissão e assunção de cargo, patrimônio, material, licitação no
âmbito da OM, orçamento, prestação de contas, unidade gestora, boletim interno.

Classifique a mensagem do usuário em uma das categorias:
- LEGISLATION: qualquer pergunta que o RADA-e ou uma norma aeronáutica possa responder —
  regulamentos, artigos, capítulos, procedimentos administrativos da Aeronáutica, e também
  PERGUNTA DE TERMINOLOGIA: "o que é", "o que significa", "para que serve", sigla solta
  (TTAC, TAC, UG, OM, RADA, SILOMS) ou termo técnico que você não reconhece.
- SEFA_SYSTEMS: sistemas internos da SEFA, módulos, processos de administração financeira e orçamentária
- PROCUREMENT: licitações, contratos, pregões e compras públicas regidos pela Lei 14.133 —
  legislação FEDERAL de contratação, fora do corpus aeronáutico
- GENERAL: perguntas genéricas, não classificadas nos acima
- GREETING: saudações, cumprimentos, despedidas
- UNKNOWN: impossível classificar

Regra de desempate: NA DÚVIDA, responda LEGISLATION. Errar para LEGISLATION custa uma busca no
corpus; errar para fora dele faz a pergunta ser respondida sem nenhum documento por trás.
Sigla que você não conhece NÃO é motivo para GENERAL — é motivo para LEGISLATION, porque é
exatamente o que o regulamento define.

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
		// `UNKNOWN` agora vai ao corpus (`routerCondition`), então o classificador quebrado
		// deixou de transformar o ChatRADA num chat comum em silêncio — a busca acontece de
		// qualquer forma. O aviso continua: ele é o que distingue "não soube classificar" de
		// "o classificador está quebrado", e sem ele a falha só aparece na conta do Bedrock.
		console.warn(`[router] classificação falhou, caindo em UNKNOWN: ${error instanceof Error ? error.message : String(error)}`)
		return { intent: "UNKNOWN", original_query: query }
	}
}
